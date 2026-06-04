using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace NodeImport
{
    public class PasarelaApi : IDisposable
    {
        private readonly HttpClient _http;
        private readonly string _baseUrl;
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
        };

        public PasarelaApi(PasarelaConfig config)
        {
            _baseUrl = config.Url.TrimEnd('/');

            _http = new HttpClient();
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", config.ApiKey);
            _http.Timeout = TimeSpan.FromSeconds(30);
        }

        /// <summary>
        /// GET /api/datos/pedidos — listado paginado.
        /// </summary>
        public async Task<ListaPedidosResponse> ListarPedidos(
            int limit = 100, int offset = 0, string estado = null)
        {
            var url = $"{_baseUrl}/datos/pedidos?limit={limit}&offset={offset}";
            if (!string.IsNullOrEmpty(estado))
                url += $"&estado={Uri.EscapeDataString(estado)}";

            var response = await _http.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<ListaPedidosResponse>(json, _jsonOpts);
        }

        /// <summary>
        /// GET /api/datos/pedidos — todos los pedidos (paginando automáticamente).
        /// </summary>
        public async Task<List<PedidoPasarela>> ListarTodosPedidos(string estado = null)
        {
            var todos = new List<PedidoPasarela>();
            int offset = 0;
            const int pageSize = 200;

            while (true)
            {
                var page = await ListarPedidos(pageSize, offset, estado);
                if (page.Pedidos == null || page.Pedidos.Count == 0)
                    break;

                todos.AddRange(page.Pedidos);

                if (todos.Count >= page.Total || page.Pedidos.Count < pageSize)
                    break;

                offset += pageSize;
            }

            return todos;
        }

        /// <summary>
        /// GET /api/datos/pedidos/:id — detalle con albaranes, paradas y pcs_extra.
        /// </summary>
        public async Task<PedidoPasarela> ObtenerPedido(long id)
        {
            var url = $"{_baseUrl}/datos/pedidos/{id}";
            var response = await _http.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<PedidoPasarela>(json, _jsonOpts);
        }

        /// <summary>
        /// PATCH /api/datos/pedidos/:id/estado — cambiar estado.
        /// </summary>
        public async Task CambiarEstado(long id, string nuevoEstado)
        {
            var url = $"{_baseUrl}/datos/pedidos/{id}/estado";
            var body = JsonSerializer.Serialize(new { estado = nuevoEstado });
            var content = new StringContent(body, Encoding.UTF8, "application/json");

            var request = new HttpRequestMessage(new HttpMethod("PATCH"), url) { Content = content };
            var response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        /// <summary>
        /// GET /api/health — test de conexion.
        /// </summary>
        public async Task<string> TestConexion()
        {
            var url = $"{_baseUrl}/health";
            var response = await _http.GetAsync(url);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public void Dispose()
        {
            _http?.Dispose();
        }
    }
}
