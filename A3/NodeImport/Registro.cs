using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NodeImport
{
    public class PedidoPasarela
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("numero_pedido")]
        public string NumeroPedido { get; set; }

        [JsonPropertyName("tipo")]
        public string Tipo { get; set; }

        [JsonPropertyName("estado")]
        public string Estado { get; set; }

        [JsonPropertyName("fecha_plan")]
        public string FechaPlan { get; set; }

        [JsonPropertyName("fecha_reparto")]
        public string FechaReparto { get; set; }

        [JsonPropertyName("cliente_codigo")]
        public string ClienteCodigo { get; set; }

        [JsonPropertyName("cliente_cif")]
        public string ClienteCif { get; set; }

        [JsonPropertyName("tercero_codigo")]
        public string TerceroCodigo { get; set; }

        [JsonPropertyName("tercero_cif")]
        public string TerceroCif { get; set; }

        [JsonPropertyName("delegacion_codigo")]
        public string DelegacionCodigo { get; set; }

        [JsonPropertyName("chofer_principal_codigo")]
        public string ChoferPrincipalCodigo { get; set; }

        [JsonPropertyName("matricula_tractor")]
        public string MatriculaTractor { get; set; }

        [JsonPropertyName("matricula_remolque")]
        public string MatriculaRemolque { get; set; }

        [JsonPropertyName("matricula_contenedor")]
        public string MatriculaContenedor { get; set; }

        [JsonPropertyName("bl_numero")]
        public string BlNumero { get; set; }

        [JsonPropertyName("expediente_transitario")]
        public string ExpedienteTransitario { get; set; }

        [JsonPropertyName("operacion_tipo")]
        public string OperacionTipo { get; set; }

        [JsonPropertyName("naviera_codigo")]
        public string NavieraCodigo { get; set; }

        [JsonPropertyName("naviera_nombre")]
        public string NavieraNombre { get; set; }

        [JsonPropertyName("buque_nombre")]
        public string BuqueNombre { get; set; }

        [JsonPropertyName("viaje_buque")]
        public string ViajeBuque { get; set; }

        [JsonPropertyName("albaranes_concatenados")]
        public string AlbaranesConcatenados { get; set; }

        [JsonPropertyName("expedicion")]
        public string Expedicion { get; set; }

        [JsonPropertyName("proveedor_codigo")]
        public string ProveedorCodigo { get; set; }

        [JsonPropertyName("origen")]
        public string Origen { get; set; }

        [JsonPropertyName("created_at")]
        public string CreatedAt { get; set; }

        [JsonPropertyName("updated_at")]
        public string UpdatedAt { get; set; }

        // Relaciones (vienen en GET /pedidos/:id)
        [JsonPropertyName("albaranes")]
        public List<AlbaranPasarela> Albaranes { get; set; }

        [JsonPropertyName("paradas")]
        public List<ParadaPasarela> Paradas { get; set; }

        [JsonPropertyName("pcs_extra")]
        public PcsExtraPasarela PcsExtra { get; set; }

        public string FechaEfectiva => FechaReparto ?? FechaPlan;

        public string Resumen => $"#{Id} {NumeroPedido ?? ""} [{Estado}] {ProveedorCodigo}";

        public bool EsSatelles => string.Equals(ProveedorCodigo, "satelles", StringComparison.OrdinalIgnoreCase);
        public bool EsPcs => string.Equals(ProveedorCodigo, "pcs-valencia", StringComparison.OrdinalIgnoreCase);
    }

    public class AlbaranPasarela
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("numero")]
        public string Numero { get; set; }

        [JsonPropertyName("fecha")]
        public string Fecha { get; set; }

        [JsonPropertyName("lugar_carga_codigo")]
        public string LugarCargaCodigo { get; set; }

        [JsonPropertyName("unidad_medida")]
        public string UnidadMedida { get; set; }
    }

    public class ParadaPasarela
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("tipo")]
        public string Tipo { get; set; }

        [JsonPropertyName("orden")]
        public string Orden { get; set; }

        [JsonPropertyName("secuencia")]
        public int? Secuencia { get; set; }

        [JsonPropertyName("lugar_nombre")]
        public string LugarNombre { get; set; }

        [JsonPropertyName("lugar_codigo")]
        public string LugarCodigo { get; set; }

        [JsonPropertyName("tipo_lugar")]
        public string TipoLugar { get; set; }

        [JsonPropertyName("direccion1")]
        public string Direccion1 { get; set; }

        [JsonPropertyName("direccion2")]
        public string Direccion2 { get; set; }

        [JsonPropertyName("codigo_postal")]
        public string CodigoPostal { get; set; }

        [JsonPropertyName("municipio")]
        public string Municipio { get; set; }

        [JsonPropertyName("provincia")]
        public string Provincia { get; set; }

        [JsonPropertyName("pais")]
        public string Pais { get; set; }

        [JsonPropertyName("telefono")]
        public string Telefono { get; set; }

        [JsonPropertyName("persona_contacto")]
        public string PersonaContacto { get; set; }

        [JsonPropertyName("producto")]
        public string Producto { get; set; }

        [JsonPropertyName("cantidad")]
        public double? Cantidad { get; set; }

        [JsonPropertyName("unidad_medida")]
        public string UnidadMedida { get; set; }

        [JsonPropertyName("kms_tramo")]
        public double? KmsTramo { get; set; }

        [JsonPropertyName("llegada_prevista")]
        public string LlegadaPrevista { get; set; }

        [JsonPropertyName("llegada_real")]
        public string LlegadaReal { get; set; }

        [JsonPropertyName("salida_prevista")]
        public string SalidaPrevista { get; set; }

        [JsonPropertyName("salida_real")]
        public string SalidaReal { get; set; }

        public string DescripcionLinea
        {
            get
            {
                var partes = new List<string>();
                var tipoStr = string.Equals(Tipo, "CARGA", StringComparison.OrdinalIgnoreCase) ? "C" : "D";
                partes.Add($"[{tipoStr}]");
                if (!string.IsNullOrEmpty(LugarNombre)) partes.Add(LugarNombre);
                if (!string.IsNullOrEmpty(Municipio)) partes.Add(Municipio);
                if (!string.IsNullOrEmpty(Direccion1)) partes.Add(Direccion1);
                if (!string.IsNullOrEmpty(Producto)) partes.Add(Producto);
                return string.Join(" | ", partes);
            }
        }
    }

    public class PcsExtraPasarela
    {
        [JsonPropertyName("transporte_tipo")]
        public string TransporteTipo { get; set; }

        [JsonPropertyName("contenedor_iso_tipo")]
        public string ContenedorIsoTipo { get; set; }

        [JsonPropertyName("contenedor_full_state")]
        public string ContenedorFullState { get; set; }

        [JsonPropertyName("mercancia_descripcion")]
        public string MercanciaDescripcion { get; set; }

        [JsonPropertyName("mercancia_peso_bruto")]
        public double? MercanciaPesoBruto { get; set; }

        [JsonPropertyName("customs_status")]
        public string CustomsStatus { get; set; }

        [JsonPropertyName("precinto_numero")]
        public string PrecintoNumero { get; set; }
    }

    public class DetallePedidoResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("data")]
        public DetallePedidoData Data { get; set; }
    }

    public class DetallePedidoData
    {
        [JsonPropertyName("pedido")]
        public PedidoPasarela Pedido { get; set; }

        [JsonPropertyName("albaranes")]
        public List<AlbaranPasarela> Albaranes { get; set; }

        [JsonPropertyName("paradas")]
        public List<ParadaPasarela> Paradas { get; set; }

        [JsonPropertyName("pcs_extra")]
        public PcsExtraPasarela PcsExtra { get; set; }
    }

    public class ListaPedidosResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("data")]
        public ListaPedidosData Data { get; set; }

        // Atajos para no romper el resto del código
        public List<PedidoPasarela> Pedidos => Data?.Pedidos;
        public int Total => Data?.Total ?? 0;
    }

    public class ListaPedidosData
    {
        [JsonPropertyName("pedidos")]
        public List<PedidoPasarela> Pedidos { get; set; }

        [JsonPropertyName("total")]
        public int Total { get; set; }

        [JsonPropertyName("limit")]
        public int Limit { get; set; }

        [JsonPropertyName("offset")]
        public int Offset { get; set; }
    }
}
