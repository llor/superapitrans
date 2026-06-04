using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NodeImport
{
    public class AppConfig
    {
        [JsonPropertyName("pasarela")]
        public PasarelaConfig Pasarela { get; set; }

        [JsonPropertyName("a3erp")]
        public A3ErpConfig A3Erp { get; set; }

        [JsonPropertyName("a3sql")]
        public A3SqlConfig A3Sql { get; set; }

        [JsonPropertyName("import")]
        public ImportSettings Import { get; set; }

        private static readonly string RutaConfig = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "config.json");

        public static AppConfig Cargar(bool skipA3Validation = false)
        {
            if (!File.Exists(RutaConfig))
                throw new FileNotFoundException(
                    $"No se encuentra el archivo de configuracion: {RutaConfig}");

            var json = File.ReadAllText(RutaConfig);
            var config = JsonSerializer.Deserialize<AppConfig>(json);

            if (config.Pasarela == null)
                throw new InvalidOperationException("Falta la seccion 'pasarela' en config.json");
            if (string.IsNullOrEmpty(config.Pasarela.Url))
                throw new InvalidOperationException("Falta 'pasarela.url' en config.json");
            if (string.IsNullOrEmpty(config.Pasarela.Empresa))
                throw new InvalidOperationException("Falta 'pasarela.empresa' en config.json");
            if (string.IsNullOrEmpty(config.Pasarela.ApiKey))
                throw new InvalidOperationException("Falta 'pasarela.apiKey' en config.json");

            if (!skipA3Validation)
            {
                if (config.A3Erp == null)
                    throw new InvalidOperationException("Falta la seccion 'a3erp' en config.json");
                if (string.IsNullOrEmpty(config.A3Erp.Usuario))
                    throw new InvalidOperationException("Falta 'a3erp.usuario' en config.json");
                if (string.IsNullOrEmpty(config.A3Erp.Password))
                    throw new InvalidOperationException("Falta 'a3erp.password' en config.json");
            }

            return config;
        }

        public void Guardar()
        {
            var opts = new JsonSerializerOptions { WriteIndented = true };
            File.WriteAllText(RutaConfig, JsonSerializer.Serialize(this, opts));
        }
    }

    public class PasarelaConfig
    {
        [JsonPropertyName("url")]
        public string Url { get; set; }

        [JsonPropertyName("empresa")]
        public string Empresa { get; set; }

        [JsonPropertyName("apiKey")]
        public string ApiKey { get; set; }
    }

    public class A3ErpConfig
    {
        [JsonPropertyName("empresa")]
        public string Empresa { get; set; }

        [JsonPropertyName("usuario")]
        public string Usuario { get; set; }

        [JsonPropertyName("password")]
        public string Password { get; set; }
    }

    public class A3SqlConfig
    {
        [JsonPropertyName("modoAuth")]
        public string ModoAuth { get; set; }

        [JsonPropertyName("usuario")]
        public string Usuario { get; set; }

        [JsonPropertyName("password")]
        public string Password { get; set; }
    }

    public class ImportSettings
    {
        [JsonPropertyName("codCliA3")]
        public string CodCliA3 { get; set; }

        [JsonPropertyName("codArtSatelles")]
        public string CodArtSatelles { get; set; }

        [JsonPropertyName("codArtPcs")]
        public string CodArtPcs { get; set; }

        [JsonPropertyName("cambiarEstadoTras")]
        public string CambiarEstadoTras { get; set; }
    }

    public class CliArgs
    {
        public bool EsCli { get; set; }
        public bool EsRestore { get; set; }
        public string LogFile { get; set; }
        public Rectangle? Bounds { get; set; }
        public int? KillPid { get; set; }
        public string Estado { get; set; }
        public DateTime Desde { get; set; } = DateTime.Today.AddDays(-30);
        public DateTime Hasta { get; set; } = DateTime.Today;
        public bool SoloConsulta { get; set; }

        public static CliArgs Parse(string[] args)
        {
            var cli = new CliArgs();

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLower())
                {
                    case "--cli":
                        cli.EsCli = true;
                        break;
                    case "--restore":
                        cli.EsRestore = true;
                        break;
                    case "--estado":
                        if (i + 1 < args.Length)
                            cli.Estado = args[++i];
                        else
                            throw new ArgumentException("--estado requiere un valor");
                        break;
                    case "--desde":
                        if (i + 1 < args.Length)
                        {
                            if (!DateTime.TryParse(args[++i], out var desde))
                                throw new ArgumentException($"Fecha --desde invalida: {args[i]}");
                            cli.Desde = desde;
                        }
                        else
                            throw new ArgumentException("--desde requiere una fecha");
                        break;
                    case "--hasta":
                        if (i + 1 < args.Length)
                        {
                            if (!DateTime.TryParse(args[++i], out var hasta))
                                throw new ArgumentException($"Fecha --hasta invalida: {args[i]}");
                            cli.Hasta = hasta;
                        }
                        else
                            throw new ArgumentException("--hasta requiere una fecha");
                        break;
                    case "--solo-consulta":
                        cli.SoloConsulta = true;
                        break;
                    case "--logfile":
                        if (i + 1 < args.Length)
                            cli.LogFile = args[++i];
                        break;
                    case "--bounds":
                        if (i + 1 < args.Length)
                        {
                            var parts = args[++i].Split(',');
                            if (parts.Length == 4
                                && int.TryParse(parts[0], out var bx)
                                && int.TryParse(parts[1], out var by)
                                && int.TryParse(parts[2], out var bw)
                                && int.TryParse(parts[3], out var bh))
                            {
                                cli.Bounds = new Rectangle(bx, by, bw, bh);
                            }
                        }
                        break;
                    case "--kill-pid":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var pid))
                            cli.KillPid = pid;
                        break;
                }
            }

            return cli;
        }

        public static string MostrarAyuda()
        {
            return "NodeImport — Importador SaycuNode -> A3ERP\n\n" +
                   "Uso GUI:\n" +
                   "  NodeImport.exe\n\n" +
                   "Uso CLI:\n" +
                   "  NodeImport.exe --cli [--estado PENDIENTE] [--desde yyyy-MM-dd] [--hasta yyyy-MM-dd] [--solo-consulta]\n\n" +
                   "Opciones:\n" +
                   "  --cli             Ejecutar en modo consola (sin interfaz grafica)\n" +
                   "  --estado <est>    Filtrar por estado (PENDIENTE, LEIDO, ACEPTADO, INICIADO, TERMINADO)\n" +
                   "  --desde <fecha>   Fecha inicio (por defecto: hace 30 dias)\n" +
                   "  --hasta <fecha>   Fecha fin (por defecto: hoy)\n" +
                   "  --solo-consulta   Solo consultar sin importar a A3\n";
        }
    }
}
