using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace NodeImport
{
    public class A3ErpService : IDisposable
    {
        private dynamic _enlace;
        private dynamic _documento;
        private readonly AppConfig _appConfig;
        private readonly A3ErpConfig _config;
        private bool _conectado;
        private bool _documentoIniciado;
        private string _tipoDocumentoActual;

        private Dictionary<string, string> _cacheArticulosA3;
        private Dictionary<string, string> _cacheCentrosCosteA3;
        private readonly Dictionary<string, string> _articulosCreados = new();

        public IReadOnlyDictionary<string, string> ArticulosCreados => _articulosCreados;

        public A3ErpService(AppConfig config)
        {
            _appConfig = config;
            _config = config.A3Erp;
        }

        private static string ObtenerDirA3Erp()
        {
            const string clsid = "{3FD1A508-9F47-487B-8D47-19064E37EB14}";
            try
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                    $@"SOFTWARE\WOW6432Node\Classes\CLSID\{clsid}\InprocServer32");
                var dll = key?.GetValue(null)?.ToString();
                if (!string.IsNullOrEmpty(dll))
                    return Path.GetDirectoryName(dll);
            }
            catch { }
            return null;
        }

        private static string ObtenerServidorSqlDesdeSistemaIni()
        {
            var dirA3 = ObtenerDirA3Erp();
            if (string.IsNullOrEmpty(dirA3))
                throw new InvalidOperationException("No se pudo localizar el directorio de A3ERP.");

            var iniPath = Path.Combine(dirA3, "Sistema.ini");
            if (!File.Exists(iniPath))
                throw new InvalidOperationException($"No se encontro Sistema.ini en {iniPath}");

            foreach (var raw in File.ReadLines(iniPath))
            {
                var line = raw?.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (!line.StartsWith("Servidor=", StringComparison.OrdinalIgnoreCase)) continue;
                var servidor = line.Substring("Servidor=".Length).Trim();
                if (!string.IsNullOrEmpty(servidor))
                    return servidor;
            }

            throw new InvalidOperationException("No se encontro la clave 'Servidor=' en Sistema.ini");
        }

        public void Conectar(string empresaOverride = null)
        {
            var empresa = empresaOverride ?? _config?.Empresa;
            if (string.IsNullOrEmpty(empresa))
                throw new InvalidOperationException(
                    "No se ha definido la empresa A3. Configure 'a3erp.empresa' en config.json");

            var tipoEnlace = Type.GetTypeFromProgID("a3ERPActiveX.Enlace");
            if (tipoEnlace == null)
                throw new InvalidOperationException(
                    "No se encontro a3ERPActiveX.Enlace. Verifique que a3ERP este instalado.");

            _enlace = Activator.CreateInstance(tipoEnlace);

            string usuario = _config?.Usuario;
            string password = _config?.Password;

            if (!string.IsNullOrEmpty(usuario))
            {
                bool loginOk = _enlace.LoginUsuario(usuario, password ?? "");
                if (!loginOk)
                    throw new InvalidOperationException(
                        $"Login A3ERP fallido para usuario '{usuario}'.");
            }

            _enlace.Iniciar(empresa, "");
            _conectado = true;
            Logger.Info($"Conectado a A3ERP empresa '{empresa}' como '{usuario}'");
        }

        /// <summary>
        /// Inicializa el objeto COM para el tipo de documento especificado.
        /// "Albaran" para Satelles, "Pedido" para PCS Valencia.
        /// </summary>
        private void AsegurarDocumentoIniciado(string tipoDocumento)
        {
            if (_documentoIniciado && _tipoDocumentoActual == tipoDocumento)
                return;

            if (_documento != null)
            {
                try { Marshal.ReleaseComObject(_documento); } catch { }
                _documento = null;
            }

            string progId = tipoDocumento == "Pedido"
                ? "a3ERPActiveX.Pedido"
                : "a3ERPActiveX.Albaran";

            var tipo = Type.GetTypeFromProgID(progId);
            if (tipo == null)
                throw new InvalidOperationException(
                    $"No se encontro {progId}. Verifique la instalacion de a3ERP.");

            _documento = Activator.CreateInstance(tipo);
            _documento.Iniciar();
            _documentoIniciado = true;
            _tipoDocumentoActual = tipoDocumento;
            Logger.Info($"Objeto COM {progId} iniciado");
        }

        /// <summary>
        /// Importa un pedido de Satelles como Albaran de compra.
        /// Un albaran por pedido, una linea por albaran.
        /// </summary>
        public ResultadoImport ImportarSatelles(PedidoPasarela pedido, string codCliA3, string codArt)
        {
            var resultado = new ResultadoImport { PedidoId = pedido.Id, Referencia = pedido.NumeroPedido };

            try
            {
                AsegurarDocumentoIniciado("Albaran");

                string fechaStr = ParseFecha(pedido.FechaEfectiva);

                _documento.Nuevo(fechaStr, codCliA3, true);

                _documento.AsStringCab["REFERENCIA"] = $"NI-{pedido.Id}";

                if (!string.IsNullOrEmpty(pedido.Expedicion))
                    _documento.AsStringCab["OBSERVACIONES"] = pedido.Expedicion;

                double cantidad = 1;
                _documento.NuevaLineaArt(codArt, (decimal)cantidad);

                var descPartes = new List<string>();
                if (!string.IsNullOrEmpty(pedido.NumeroPedido)) descPartes.Add($"Ped: {pedido.NumeroPedido}");
                if (!string.IsNullOrEmpty(pedido.AlbaranesConcatenados)) descPartes.Add($"Alb: {pedido.AlbaranesConcatenados}");
                if (!string.IsNullOrEmpty(pedido.MatriculaTractor)) descPartes.Add($"Trac: {pedido.MatriculaTractor}");
                if (!string.IsNullOrEmpty(pedido.MatriculaRemolque)) descPartes.Add($"Rem: {pedido.MatriculaRemolque}");
                var descLinea = string.Join(" | ", descPartes);
                if (!string.IsNullOrEmpty(descLinea))
                    _documento.AsStringLin["DESCLIN"] = descLinea;

                _documento.AnadirLinea();

                decimal idDoc = _documento.Anade();

                resultado.Exito = true;
                resultado.IdDocumentoA3 = idDoc;
                resultado.TipoDocumento = "Albaran";
                resultado.Mensaje = $"Albaran de compra creado (ID A3: {idDoc})";
            }
            catch (COMException comEx)
            {
                resultado.Error = $"Error COM A3ERP: {comEx.Message}";
                Logger.Error($"Satelles import COM error pedido {pedido.Id}", comEx);
                try { _documento.Cancela(); } catch { }
            }
            catch (Exception ex)
            {
                resultado.Error = $"Error: {ex.Message}";
                Logger.Error($"Satelles import error pedido {pedido.Id}", ex);
                try { _documento.Cancela(); } catch { }
            }

            return resultado;
        }

        /// <summary>
        /// Importa un pedido de PCS Valencia como Pedido de compra.
        /// Una linea por cada parada.
        /// </summary>
        public ResultadoImport ImportarPcsValencia(PedidoPasarela pedido, string codCliA3, string codArt)
        {
            var resultado = new ResultadoImport { PedidoId = pedido.Id, Referencia = pedido.NumeroPedido };

            try
            {
                AsegurarDocumentoIniciado("Pedido");

                string fechaStr = ParseFecha(pedido.FechaEfectiva);

                _documento.Nuevo(fechaStr, codCliA3, true);

                _documento.AsStringCab["REFERENCIA"] = $"NI-{pedido.Id}";

                var obsPartes = new List<string>();
                if (!string.IsNullOrEmpty(pedido.BlNumero)) obsPartes.Add($"BL: {pedido.BlNumero}");
                if (!string.IsNullOrEmpty(pedido.MatriculaContenedor)) obsPartes.Add($"Cont: {pedido.MatriculaContenedor}");
                if (!string.IsNullOrEmpty(pedido.BuqueNombre)) obsPartes.Add($"Buque: {pedido.BuqueNombre}");
                if (!string.IsNullOrEmpty(pedido.NavieraNombre)) obsPartes.Add($"Naviera: {pedido.NavieraNombre}");
                if (!string.IsNullOrEmpty(pedido.OperacionTipo)) obsPartes.Add($"Op: {pedido.OperacionTipo}");
                if (obsPartes.Count > 0)
                    _documento.AsStringCab["OBSERVACIONES"] = string.Join(" | ", obsPartes);

                if (pedido.Paradas != null && pedido.Paradas.Count > 0)
                {
                    foreach (var parada in pedido.Paradas.OrderBy(p => p.Secuencia))
                    {
                        double cant = parada.Cantidad ?? 1;
                        _documento.NuevaLineaArt(codArt, (decimal)cant);
                        _documento.AsStringLin["DESCLIN"] = parada.DescripcionLinea;
                        _documento.AnadirLinea();
                    }
                }
                else
                {
                    _documento.NuevaLineaArt(codArt, 1m);
                    _documento.AsStringLin["DESCLIN"] = $"Pedido {pedido.NumeroPedido ?? pedido.Id.ToString()} sin paradas";
                    _documento.AnadirLinea();
                }

                decimal idDoc = _documento.Anade();

                resultado.Exito = true;
                resultado.IdDocumentoA3 = idDoc;
                resultado.TipoDocumento = "Pedido";
                resultado.Mensaje = $"Pedido de compra creado (ID A3: {idDoc})";
            }
            catch (COMException comEx)
            {
                resultado.Error = $"Error COM A3ERP: {comEx.Message}";
                Logger.Error($"PCS import COM error pedido {pedido.Id}", comEx);
                try { _documento.Cancela(); } catch { }
            }
            catch (Exception ex)
            {
                resultado.Error = $"Error: {ex.Message}";
                Logger.Error($"PCS import error pedido {pedido.Id}", ex);
                try { _documento.Cancela(); } catch { }
            }

            return resultado;
        }

        /// <summary>
        /// Obtiene las referencias ya importadas por NodeImport (prefijo NI-).
        /// Busca en CABEALBV (albaranes) y CABEPED (pedidos).
        /// </summary>
        public HashSet<string> ObtenerReferenciasImportadasSql(string empresa)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            string servidor = ObtenerServidorSqlDesdeSistemaIni();

            var a3sql = _appConfig.A3Sql;
            string cs;
            if (a3sql != null && string.Equals(a3sql.ModoAuth, "sql", StringComparison.OrdinalIgnoreCase))
            {
                var u = a3sql.Usuario;
                var p = a3sql.Password;
                if (string.IsNullOrEmpty(u) || string.IsNullOrEmpty(p))
                    throw new InvalidOperationException("a3sql.modoAuth='sql' requiere usuario y password.");
                cs = $"Provider=SQLOLEDB;Data Source={servidor};Initial Catalog={empresa};User ID={u};Password={p};Persist Security Info=False;";
            }
            else
            {
                cs = $"Provider=SQLOLEDB;Data Source={servidor};Initial Catalog={empresa};Integrated Security=SSPI;Persist Security Info=False;";
            }

            var tipoCn = Type.GetTypeFromProgID("ADODB.Connection");
            if (tipoCn == null)
                throw new InvalidOperationException("No se encuentra ADODB.Connection.");

            dynamic cn = Activator.CreateInstance(tipoCn);
            dynamic rs = null;
            try
            {
                cn.Open(cs);

                // Albaranes (Satelles)
                rs = cn.Execute("SELECT REFERENCIA FROM CABEALBV WHERE REFERENCIA LIKE 'NI-%' UNION ALL SELECT REFERENCIA FROM CABEPED WHERE REFERENCIA LIKE 'NI-%'");
                while (!(bool)rs.EOF)
                {
                    var refVal = rs.Fields["REFERENCIA"].Value?.ToString();
                    if (!string.IsNullOrEmpty(refVal) && refVal.Length > 3)
                        result.Add(refVal.Substring(3));
                    rs.MoveNext();
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Error consultando referencias importadas: {ex.Message}", ex);
            }
            finally
            {
                try { if (rs != null) rs.Close(); } catch { }
                try { if (cn != null) cn.Close(); } catch { }
                if (rs != null) try { Marshal.ReleaseComObject(rs); } catch { }
                if (cn != null) try { Marshal.ReleaseComObject(cn); } catch { }
            }

            return result;
        }

        public string TestConexionRapida(string empresa)
        {
            Conectar(empresa);

            var tipoMaestro = Type.GetTypeFromProgID("a3ERPActiveX.Maestro");
            if (tipoMaestro == null)
                return "Conectado (Maestro no disponible)";

            dynamic maestro = Activator.CreateInstance(tipoMaestro);
            try
            {
                maestro.Iniciar("Clientes");
                maestro.Primero();
                var cod = maestro.AsString["CODCLI"]?.ToString()?.Trim() ?? "(vacio)";
                var nom = maestro.AsString["NOMCLI"]?.ToString()?.Trim() ?? "";
                maestro.Acabar();
                return $"OK — Primer cliente: {cod} {nom}";
            }
            catch (Exception ex)
            {
                try { maestro.Acabar(); } catch { }
                return $"Conectado pero error leyendo clientes: {ex.Message}";
            }
            finally
            {
                Marshal.ReleaseComObject(maestro);
            }
        }

        /// <summary>
        /// Crea un articulo en A3ERP si no existe. Devuelve el CODART.
        /// </summary>
        public string CrearArticuloSiNoExiste(string descripcion)
        {
            CargarCacheArticulos();

            var existente = _cacheArticulosA3
                .FirstOrDefault(kv => string.Equals(kv.Value, descripcion, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(existente.Key))
                return existente.Key;

            var tipoMaestro = Type.GetTypeFromProgID("a3ERPActiveX.Maestro");
            if (tipoMaestro == null)
                throw new InvalidOperationException("a3ERPActiveX.Maestro no disponible");

            dynamic maestro = Activator.CreateInstance(tipoMaestro);
            try
            {
                maestro.Iniciar("Articulos");
                maestro.Nuevo();
                string nuevoCod = maestro.NuevoCodigoNum().ToString().Trim();
                maestro.AsString["CODART"] = nuevoCod;
                maestro.AsString["DESCART"] = descripcion;
                maestro.Guarda(true);
                maestro.Acabar();

                _cacheArticulosA3[nuevoCod] = descripcion;
                Logger.Info($"Articulo creado en A3: {nuevoCod} = {descripcion}");
                return nuevoCod;
            }
            catch
            {
                try { maestro.Acabar(); } catch { }
                throw;
            }
            finally
            {
                Marshal.ReleaseComObject(maestro);
            }
        }

        /// <summary>
        /// Crea un centro de coste en A3 si no existe. Devuelve el codigo.
        /// </summary>
        public string ObtenerOCrearCentroCoste(string descripcion)
        {
            CargarCacheCentrosCoste();

            if (_cacheCentrosCosteA3.TryGetValue(descripcion.ToUpperInvariant(), out var codExistente))
                return codExistente;

            var tipoMaestro = Type.GetTypeFromProgID("a3ERPActiveX.Maestro");
            if (tipoMaestro == null) return null;

            dynamic maestro = Activator.CreateInstance(tipoMaestro);
            try
            {
                maestro.Iniciar("CentrosCoste");
                maestro.Nuevo();
                string nuevoCod = maestro.NuevoCodigoNum().ToString().Trim();
                maestro.AsString["CENTROCOSTE"] = nuevoCod;
                maestro.AsString["DESCCENTRO"] = descripcion;
                maestro.Guarda(true);
                maestro.Acabar();

                _cacheCentrosCosteA3[descripcion.ToUpperInvariant()] = nuevoCod;
                Logger.Info($"Centro coste creado: {nuevoCod} = {descripcion}");
                return nuevoCod;
            }
            catch
            {
                try { maestro.Acabar(); } catch { }
                return null;
            }
            finally
            {
                Marshal.ReleaseComObject(maestro);
            }
        }

        private void CargarCacheArticulos()
        {
            if (_cacheArticulosA3 != null) return;
            _cacheArticulosA3 = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var tipoMaestro = Type.GetTypeFromProgID("a3ERPActiveX.Maestro");
            if (tipoMaestro == null) return;

            dynamic maestro = Activator.CreateInstance(tipoMaestro);
            try
            {
                maestro.Iniciar("Articulos");
                maestro.Primero();
                while (!(bool)maestro.EOF)
                {
                    var cod = maestro.AsString["CODART"]?.ToString()?.Trim();
                    var desc = maestro.AsString["DESCART"]?.ToString()?.Trim();
                    if (!string.IsNullOrEmpty(cod))
                        _cacheArticulosA3[cod] = desc ?? "";
                    maestro.Siguiente();
                }
                maestro.Acabar();
            }
            catch
            {
                try { maestro.Acabar(); } catch { }
            }
            finally
            {
                Marshal.ReleaseComObject(maestro);
            }
        }

        private void CargarCacheCentrosCoste()
        {
            if (_cacheCentrosCosteA3 != null) return;
            _cacheCentrosCosteA3 = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var tipoMaestro = Type.GetTypeFromProgID("a3ERPActiveX.Maestro");
            if (tipoMaestro == null) return;

            dynamic maestro = Activator.CreateInstance(tipoMaestro);
            try
            {
                maestro.Iniciar("CentrosCoste");
                maestro.Primero();
                while (!(bool)maestro.EOF)
                {
                    var cod = maestro.AsString["CENTROCOSTE"]?.ToString()?.Trim();
                    var desc = maestro.AsString["DESCCENTRO"]?.ToString()?.Trim();
                    if (!string.IsNullOrEmpty(desc) && !string.IsNullOrEmpty(cod))
                        _cacheCentrosCosteA3[desc.ToUpperInvariant()] = cod;
                    maestro.Siguiente();
                }
                maestro.Acabar();
            }
            catch
            {
                try { maestro.Acabar(); } catch { }
            }
            finally
            {
                Marshal.ReleaseComObject(maestro);
            }
        }

        private static string ParseFecha(string fecha)
        {
            if (DateTime.TryParse(fecha, out var dt))
                return dt.ToString("dd/MM/yyyy");
            return DateTime.Now.ToString("dd/MM/yyyy");
        }

        public void Dispose()
        {
            if (_documento != null)
            {
                try { Marshal.ReleaseComObject(_documento); } catch { }
                _documento = null;
            }
            if (_enlace != null)
            {
                try
                {
                    if (_conectado) _enlace.Acabar();
                }
                catch { }
                try { Marshal.ReleaseComObject(_enlace); } catch { }
                _enlace = null;
                _conectado = false;
            }
        }
    }

    public class ResultadoImport
    {
        public long PedidoId { get; set; }
        public string Referencia { get; set; }
        public bool Exito { get; set; }
        public decimal IdDocumentoA3 { get; set; }
        public string TipoDocumento { get; set; }
        public string Mensaje { get; set; }
        public string Error { get; set; }
    }
}
