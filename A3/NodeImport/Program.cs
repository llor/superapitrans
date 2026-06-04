using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace NodeImport
{
    static class Program
    {
        const string MutexName = "NodeImport_SingleInstance";

        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        static extern bool IsIconic(IntPtr hWnd);
        const int SW_RESTORE = 9;

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                var cliArgs = CliArgs.Parse(args);

                if (!cliArgs.EsCli && !cliArgs.EsRestore)
                {
                    bool createdNew;
                    using var mutex = new Mutex(true, MutexName, out createdNew);
                    if (!createdNew)
                    {
                        TraerAlFrente();
                        return;
                    }
                    EjecutarGui(cliArgs);
                    return;
                }

                if (cliArgs.EsCli)
                {
                    EjecutarCli(cliArgs).GetAwaiter().GetResult();
                }
                else
                {
                    EjecutarGui(cliArgs);
                }
            }
            catch (ArgumentException argEx)
            {
                Console.Error.WriteLine($"Error en argumentos: {argEx.Message}");
                Console.Error.WriteLine();
                Console.Error.WriteLine(CliArgs.MostrarAyuda());
                Environment.ExitCode = 1;
            }
            catch (Exception ex)
            {
                if (args != null && args.Any(a => a == "--cli"))
                {
                    Console.Error.WriteLine($"Error fatal: {ex.Message}");
                    Logger.Error("Error fatal CLI", ex);
                    Environment.ExitCode = 1;
                }
                else
                {
                    ErrorHelper.Mostrar(
                        "Error inesperado",
                        "Se produjo un error inesperado al iniciar la aplicacion.",
                        "Revise los logs en la carpeta 'log' junto al ejecutable.",
                        ex);
                }
            }
        }

        private static void EjecutarGui(CliArgs cliArgs)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, te) =>
            {
                if (te.Exception is COMException comEx)
                {
                    Logger.Error("Excepcion COM global (ignorada, posible corte RDP)", comEx);
                    return;
                }
                Logger.Error("Excepcion no manejada en hilo UI", te.Exception);
                ErrorHelper.Mostrar("Error inesperado", te.Exception.Message, ex: te.Exception);
            };
            AppDomain.CurrentDomain.UnhandledException += (s, ue) =>
            {
                if (ue.ExceptionObject is Exception ex)
                    Logger.Error("Excepcion fatal no manejada", ex);
            };

            AppConfig config;
            try
            {
                config = AppConfig.Cargar();
            }
            catch (FileNotFoundException fnf)
            {
                ErrorHelper.Mostrar(
                    "Archivo no encontrado",
                    "No se encontro el archivo config.json junto al ejecutable.",
                    "Copie config.json al mismo directorio que NodeImport.exe o ejecute el instalador.",
                    fnf);
                return;
            }
            catch (InvalidOperationException ioe)
            {
                ErrorHelper.Mostrar(
                    "Configuracion incompleta",
                    ioe.Message,
                    "Revise config.json y complete todos los campos obligatorios (pasarela.url, pasarela.empresa, pasarela.apiKey, a3erp.usuario, a3erp.password).",
                    ioe);
                return;
            }

            Application.Run(new MainForm(config, cliArgs.EsRestore ? cliArgs : null));
        }

        private static void TraerAlFrente()
        {
            var actual = Process.GetCurrentProcess();
            foreach (var proc in Process.GetProcessesByName(actual.ProcessName))
            {
                if (proc.Id != actual.Id && proc.MainWindowHandle != IntPtr.Zero)
                {
                    if (IsIconic(proc.MainWindowHandle))
                        ShowWindow(proc.MainWindowHandle, SW_RESTORE);
                    SetForegroundWindow(proc.MainWindowHandle);
                    break;
                }
            }
        }

        private static async Task EjecutarCli(CliArgs cliArgs)
        {
            var config = AppConfig.Cargar(skipA3Validation: cliArgs.SoloConsulta);

            Console.WriteLine($"NodeImport CLI — Pasarela: {config.Pasarela.Url} | Empresa: {config.Pasarela.Empresa}");
            Console.WriteLine($"Estado: {cliArgs.Estado ?? "(todos)"} | Desde: {cliArgs.Desde:yyyy-MM-dd} | Hasta: {cliArgs.Hasta:yyyy-MM-dd}");
            Logger.Info($"CLI inicio: estado={cliArgs.Estado ?? "todos"} desde={cliArgs.Desde:yyyy-MM-dd} hasta={cliArgs.Hasta:yyyy-MM-dd}");

            using var api = new PasarelaApi(config.Pasarela);

            Console.WriteLine("Consultando pedidos...");
            var pedidos = await api.ListarTodosPedidos(cliArgs.Estado);

            var filtrados = pedidos.Where(p =>
            {
                if (string.IsNullOrEmpty(p.FechaEfectiva)) return true;
                if (DateTime.TryParse(p.FechaEfectiva, out var fecha))
                    return fecha.Date >= cliArgs.Desde.Date && fecha.Date <= cliArgs.Hasta.Date;
                return true;
            }).ToList();

            Console.WriteLine($"Encontrados: {filtrados.Count} pedidos (de {pedidos.Count} totales)");
            Logger.Info($"CLI consultados {filtrados.Count} pedidos");

            if (filtrados.Count == 0 || cliArgs.SoloConsulta)
            {
                if (cliArgs.SoloConsulta && filtrados.Count > 0)
                {
                    foreach (var p in filtrados)
                        Console.WriteLine($"  {p.Resumen}");
                }
                return;
            }

            if (config.A3Erp == null)
            {
                Console.Error.WriteLine("Error: para importar a A3 se requiere la seccion 'a3erp' en config.json");
                Environment.ExitCode = 1;
                return;
            }

            string empresaA3 = config.A3Erp.Empresa;
            if (string.IsNullOrEmpty(empresaA3))
            {
                Console.Error.WriteLine("Error: no se ha definido la empresa A3 (a3erp.empresa en config.json)");
                Environment.ExitCode = 1;
                return;
            }

            var importCfg = config.Import ?? new ImportSettings();
            if (string.IsNullOrEmpty(importCfg.CodCliA3))
            {
                Console.Error.WriteLine("Error: falta import.codCliA3 en config.json");
                Environment.ExitCode = 1;
                return;
            }

            Console.WriteLine($"Empresa A3 destino: {empresaA3}");
            int ok = 0, errores = 0;

            using (var erp = new A3ErpService(config))
            {
                Console.WriteLine("Conectando con A3ERP...");
                erp.Conectar(empresaA3);
                Console.WriteLine("Conexion A3ERP establecida");

                var importados = erp.ObtenerReferenciasImportadasSql(empresaA3);
                Console.WriteLine($"Ya importados: {importados.Count} registros NI-*");

                foreach (var pedido in filtrados)
                {
                    if (importados.Contains(pedido.Id.ToString()))
                    {
                        Console.WriteLine($"  SKIP #{pedido.Id} {pedido.NumeroPedido} (ya importado)");
                        continue;
                    }

                    var detalle = await api.ObtenerPedido(pedido.Id);

                    string codArt = pedido.EsSatelles
                        ? importCfg.CodArtSatelles
                        : importCfg.CodArtPcs;

                    if (string.IsNullOrEmpty(codArt))
                        codArt = erp.CrearArticuloSiNoExiste(
                            pedido.EsSatelles ? "SERVICIO TRANSPORTE SATELLES" : "SERVICIO TRANSPORTE PCS");

                    ResultadoImport resultado = pedido.EsSatelles
                        ? erp.ImportarSatelles(detalle, importCfg.CodCliA3, codArt)
                        : erp.ImportarPcsValencia(detalle, importCfg.CodCliA3, codArt);

                    if (resultado.Exito)
                    {
                        ok++;
                        Console.WriteLine($"  OK #{pedido.Id} → {resultado.Mensaje}");
                        Logger.Info($"CLI importado #{pedido.Id} → ID A3: {resultado.IdDocumentoA3}");

                        if (!string.IsNullOrEmpty(importCfg.CambiarEstadoTras))
                        {
                            try
                            {
                                await api.CambiarEstado(pedido.Id, importCfg.CambiarEstadoTras);
                            }
                            catch (Exception exEst)
                            {
                                Logger.Error($"Error cambiando estado pedido {pedido.Id}", exEst);
                            }
                        }
                    }
                    else
                    {
                        errores++;
                        Console.Error.WriteLine($"  ERROR #{pedido.Id}: {resultado.Error}");
                        Logger.Error($"CLI #{pedido.Id}: {resultado.Error}");
                    }
                }
            }

            Console.WriteLine($"Finalizado: {ok} correctos, {errores} errores");
            Logger.Info($"CLI finalizado: {ok} OK, {errores} errores");

            if (errores > 0)
                Environment.ExitCode = 2;
        }
    }
}
