# ESTRUCTURA DE LA BASE DE DATOS — superapitrans

Este fichero es el ESPEJO de la estructura de la base de datos del proyecto.
Existe porque los datos nunca se copian entre equipos (viven dentro de Docker),
y sin él un cambio de tablas hecho en un ordenador no llegaría al otro.

La parte de abajo la REGENERA el deploy solo. No se edita a mano.

## DATOS ESPECIALES QUE HAY QUE REPLICAR

Aquí se apunta el dato que, sin ser estructura, haga falta en el otro equipo
para que el proyecto funcione (una fila de configuración, un catálogo hecho a
mano, un registro semilla). Si esta lista está vacía, es que no hay ninguno.

- (ninguno declarado)

<!-- ESTRUCTURA AUTOMÁTICA — de aquí abajo lo regenera el deploy, no editar a mano -->
## ESTRUCTURA

_Volcada de la base de datos real el 2026-08-07._

```sql
-- ============================================================
-- BASE DE DATOS: saycu_pasarela_demo
-- ============================================================
--
--
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--
-- *not* creating schema, since initdb creates it
--
-- Name: saycu_force_owner(); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.saycu_force_owner() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
            WHERE command_tag IN ('CREATE TABLE','CREATE SEQUENCE','CREATE VIEW','CREATE MATERIALIZED VIEW')
              AND object_type IN ('table','sequence','view','materialized view')
              AND schema_name NOT IN ('pg_catalog','information_schema')
  LOOP
    IF r.object_type = 'sequence' THEN
      PERFORM 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=r.objid AND d.refobjsubid>0 AND d.deptype IN ('a','i');
      IF FOUND THEN CONTINUE; END IF;
    END IF;
    EXECUTE format('ALTER %s %s OWNER TO saycutrans', upper(r.object_type), r.object_identity);
  END LOOP;
END;
$$;
--
-- Name: trigger_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.trigger_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
SET default_tablespace = '';
SET default_table_access_method = heap;
--
-- Name: albaranes; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.albaranes (
    id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    numero character varying(100) NOT NULL,
    fecha date,
    lugar_carga_codigo character varying(100),
    unidad_medida character varying(20),
    proveedor_codigo character varying(40),
    proveedor_albaran_id character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--
-- Name: albaranes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.albaranes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: albaranes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.albaranes_id_seq OWNED BY public.albaranes.id;
--
-- Name: facturas; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.facturas (
    id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    numero character varying(100) NOT NULL,
    fecha date,
    base_imponible numeric(14,4),
    iva numeric(5,2),
    total numeric(14,4),
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--
-- Name: facturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.facturas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: facturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.facturas_id_seq OWNED BY public.facturas.id;
--
-- Name: paradas; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.paradas (
    id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    albaran_id bigint,
    reparto_id_externo bigint,
    tipo character varying(20) NOT NULL,
    orden character varying(20) NOT NULL,
    secuencia integer,
    tipo_lugar character varying(50),
    lugar_codigo character varying(100),
    lugar_nombre character varying(200),
    direccion1 character varying(200),
    direccion2 character varying(200),
    codigo_postal character varying(10),
    municipio character varying(100),
    provincia character varying(100),
    pais character varying(50),
    telefono character varying(30),
    persona_contacto character varying(100),
    latitud numeric(10,7),
    longitud numeric(10,7),
    producto character varying(200),
    cantidad numeric(14,3),
    unidad_medida character varying(20),
    llegada_prevista timestamp with time zone,
    salida_prevista timestamp with time zone,
    llegada_real timestamp with time zone,
    salida_real timestamp with time zone,
    kms_tramo numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    documentos jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT paradas_orden_check CHECK (((orden)::text = ANY ((ARRAY['ORIGEN'::character varying, 'DESTINO'::character varying])::text[]))),
    CONSTRAINT paradas_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['CARGA'::character varying, 'DESCARGA'::character varying])::text[])))
);
--
-- Name: paradas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.paradas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: paradas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.paradas_id_seq OWNED BY public.paradas.id;
--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pedidos (
    id bigint NOT NULL,
    id_viaje bigint,
    id_ruta_externa character varying(100),
    cliente_codigo character varying(50),
    cliente_cif character varying(20),
    delegacion_codigo character varying(20),
    email_chofer character varying(200),
    email_remitente character varying(200),
    email_otros text,
    chofer_principal_codigo character varying(50),
    chofer_principal_cif character varying(20),
    chofer_secundario_codigo character varying(50),
    chofer_secundario_cif character varying(20),
    tercero_codigo character varying(50),
    tercero_cif character varying(20),
    matricula_tractor character varying(20),
    matricula_remolque character varying(20),
    numero_pedido character varying(500),
    albaranes_concatenados character varying(500),
    tipo character varying(20) DEFAULT 'PEDIDO'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    fecha_plan date,
    fecha_reparto date,
    origen character varying(40) DEFAULT 'desconocido'::character varying NOT NULL,
    proveedor_codigo character varying(40),
    proveedor_publication_id character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    matricula_contenedor character varying(20),
    bl_numero character varying(50),
    expediente_transitario character varying(50),
    operacion_tipo character varying(20),
    naviera_codigo character varying(20),
    naviera_nombre character varying(200),
    buque_nombre character varying(200),
    viaje_buque character varying(50),
    expedicion character varying(200),
    km_total numeric(10,2),
    km_vacio numeric(10,2),
    km_cargado numeric(10,2),
    CONSTRAINT pedidos_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'LEIDO'::character varying, 'ACEPTADO'::character varying, 'INICIADO'::character varying, 'TERMINADO'::character varying])::text[]))),
    CONSTRAINT pedidos_origen_check CHECK (((origen)::text = ANY ((ARRAY['cliente_externo'::character varying, 'proveedor_externo'::character varying, 'chofocles_email'::character varying, 'manual_admin'::character varying, 'desconocido'::character varying])::text[]))),
    CONSTRAINT pedidos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['PEDIDO'::character varying, 'ALBARAN'::character varying])::text[])))
);
--
-- Name: COLUMN pedidos.numero_pedido; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.pedidos.numero_pedido IS 'TTNPEDI · referencias de pedido de la ruta concatenadas con ;. VARCHAR(500) como albaranes_concatenados (ampliado en 0017).';
--
-- Name: COLUMN pedidos.km_total; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.pedidos.km_total IS 'Suma distance de todos los trips de la ruta';
--
-- Name: COLUMN pedidos.km_vacio; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.pedidos.km_vacio IS 'Suma distanceEmpty de todos los trips';
--
-- Name: COLUMN pedidos.km_cargado; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.pedidos.km_cargado IS 'Suma distanceLoaded de todos los trips';
--
-- Name: pedidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.pedidos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: pedidos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.pedidos_id_seq OWNED BY public.pedidos.id;
--
-- Name: pedidos_pcs_extra; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pedidos_pcs_extra (
    pedido_id bigint NOT NULL,
    transporte_tipo character varying(40),
    transporte_ferroviario boolean,
    locator_release character varying(50),
    locator_acceptance character varying(50),
    berth_request character varying(50),
    puerto_carga_codigo character varying(20),
    puerto_carga_nombre character varying(200),
    puerto_origen_codigo character varying(20),
    puerto_origen_nombre character varying(200),
    contenedor_iso_tipo character varying(20),
    contenedor_iso_descripcion character varying(200),
    contenedor_full_state character varying(20),
    contenedor_estado_release character varying(20),
    contenedor_estado_acceptance character varying(20),
    contenedor_descargado boolean,
    contenedor_tara numeric(10,2),
    contenedor_peso_bruto numeric(10,2),
    customs_status character varying(20),
    precinto_numero character varying(50),
    precinto_proveedor character varying(40),
    mercancia_descripcion character varying(500),
    mercancia_peso_bruto numeric(12,2),
    mercancia_bultos_numero integer,
    mercancia_bultos_tipo_codigo character varying(10),
    mercancia_bultos_tipo_descripcion character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    terminal_devolucion_codigo character varying(20),
    terminal_devolucion_nombre character varying(200),
    terminal_devolucion_cif character varying(30),
    terminal_devolucion_direccion character varying(200),
    terminal_devolucion_ciudad character varying(100),
    terminal_devolucion_codigo_postal character varying(10),
    terminal_devolucion_unlocode character varying(20)
);
--
-- Name: albaranes id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.albaranes ALTER COLUMN id SET DEFAULT nextval('public.albaranes_id_seq'::regclass);
--
-- Name: facturas id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.facturas ALTER COLUMN id SET DEFAULT nextval('public.facturas_id_seq'::regclass);
--
-- Name: paradas id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.paradas ALTER COLUMN id SET DEFAULT nextval('public.paradas_id_seq'::regclass);
--
-- Name: pedidos id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pedidos ALTER COLUMN id SET DEFAULT nextval('public.pedidos_id_seq'::regclass);
--
-- Name: albaranes albaranes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.albaranes
    ADD CONSTRAINT albaranes_pkey PRIMARY KEY (id);
--
-- Name: facturas facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_pkey PRIMARY KEY (id);
--
-- Name: paradas paradas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.paradas
    ADD CONSTRAINT paradas_pkey PRIMARY KEY (id);
--
-- Name: pedidos_pcs_extra pedidos_pcs_extra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pedidos_pcs_extra
    ADD CONSTRAINT pedidos_pcs_extra_pkey PRIMARY KEY (pedido_id);
--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);
--
-- Name: idx_albaranes_pedido; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_albaranes_pedido ON public.albaranes USING btree (pedido_id);
--
-- Name: idx_facturas_pedido; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_facturas_pedido ON public.facturas USING btree (pedido_id);
--
-- Name: idx_paradas_albaran; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_paradas_albaran ON public.paradas USING btree (albaran_id);
--
-- Name: idx_paradas_pedido; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_paradas_pedido ON public.paradas USING btree (pedido_id);
--
-- Name: idx_paradas_pedido_seq; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_paradas_pedido_seq ON public.paradas USING btree (pedido_id, secuencia);
--
-- Name: idx_pedidos_bl_numero; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pedidos_bl_numero ON public.pedidos USING btree (bl_numero) WHERE (bl_numero IS NOT NULL);
--
-- Name: idx_pedidos_estado_fecha; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pedidos_estado_fecha ON public.pedidos USING btree (estado, fecha_reparto);
--
-- Name: idx_pedidos_matricula_contenedor; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pedidos_matricula_contenedor ON public.pedidos USING btree (matricula_contenedor) WHERE (matricula_contenedor IS NOT NULL);
--
-- Name: idx_pedidos_tercero; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pedidos_tercero ON public.pedidos USING btree (tercero_cif);
--
-- Name: uniq_albaranes_proveedor_id; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX uniq_albaranes_proveedor_id ON public.albaranes USING btree (proveedor_codigo, proveedor_albaran_id) WHERE (proveedor_albaran_id IS NOT NULL);
--
-- Name: uniq_pedidos_proveedor_pub; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX uniq_pedidos_proveedor_pub ON public.pedidos USING btree (proveedor_codigo, proveedor_publication_id) WHERE (proveedor_publication_id IS NOT NULL);
--
-- Name: albaranes trg_albaranes_upd; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_albaranes_upd BEFORE UPDATE ON public.albaranes FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
--
-- Name: facturas trg_facturas_upd; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_facturas_upd BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
--
-- Name: paradas trg_paradas_upd; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_paradas_upd BEFORE UPDATE ON public.paradas FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
--
-- Name: pedidos_pcs_extra trg_pedidos_pcs_extra_upd; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_pedidos_pcs_extra_upd BEFORE UPDATE ON public.pedidos_pcs_extra FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
--
-- Name: pedidos trg_pedidos_upd; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_pedidos_upd BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
--
-- Name: albaranes albaranes_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.albaranes
    ADD CONSTRAINT albaranes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
--
-- Name: facturas facturas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
--
-- Name: paradas paradas_albaran_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.paradas
    ADD CONSTRAINT paradas_albaran_id_fkey FOREIGN KEY (albaran_id) REFERENCES public.albaranes(id) ON DELETE SET NULL;
--
-- Name: paradas paradas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.paradas
    ADD CONSTRAINT paradas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
--
-- Name: pedidos_pcs_extra pedidos_pcs_extra_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pedidos_pcs_extra
    ADD CONSTRAINT pedidos_pcs_extra_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
--
-- Name: saycu_force_owner_trigger; Type: EVENT TRIGGER; Schema: -; Owner: -
--
CREATE EVENT TRIGGER saycu_force_owner_trigger ON ddl_command_end
         WHEN TAG IN ('CREATE TABLE', 'CREATE SEQUENCE', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
   EXECUTE FUNCTION public.saycu_force_owner();
--
--
```
