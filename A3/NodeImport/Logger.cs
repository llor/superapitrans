using System;
using System.IO;

namespace NodeImport
{
    public static class Logger
    {
        private static readonly string DirectorioLog = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "log");

        private static readonly object _lock = new object();

        public static void Escribir(string mensaje)
        {
            lock (_lock)
            {
                try
                {
                    if (!Directory.Exists(DirectorioLog))
                        Directory.CreateDirectory(DirectorioLog);

                    var archivo = Path.Combine(DirectorioLog,
                        $"nodeimport_{DateTime.Now:yyyyMMdd}.log");

                    var linea = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | {mensaje}";
                    File.AppendAllText(archivo, linea + Environment.NewLine);
                }
                catch { }
            }
        }

        public static void Info(string mensaje) =>
            Escribir($"INFO  | {mensaje}");

        public static void Error(string mensaje) =>
            Escribir($"ERROR | {mensaje}");

        public static void Error(string mensaje, Exception ex) =>
            Escribir(ex != null
                ? $"ERROR | {mensaje} | {ex.GetType().Name}: {ex.Message}"
                : $"ERROR | {mensaje}");
    }
}
