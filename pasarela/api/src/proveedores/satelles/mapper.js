/**
 * Mapeo Satelles route → 4 tablas canónicas (pedidos, albaranes, paradas).
 *
 * Entrada: cada elemento del array que devuelve `GET /puba/routes/finished`:
 *   { id: <publicationId>, route: { ...estructura anidada... } }
 *
 * Salida: { pedido, albaranes[], paradas[] } en formato listo para INSERT.
 *
 * Decisiones documentadas en pasarela/GUION.md (sección
 * "Mapeo Satelles → tablas canónicas").
 */

const PROVEEDOR = 'satelles';

function safeArr(v) { return Array.isArray(v) ? v : []; }
function safeStr(v) { return v === undefined || v === null ? null : String(v); }

function buildPedido(publication) {
    const route = publication.route || {};
    const driver = route.driver || {};
    const tractor = route.tractor || {};
    const trailer = route.trailer || {};
    const delegation = route.delegation || {};

    // Buscamos la primera entrega para obtener cliente y referencia de pedido.
    let firstOrder = null;
    let firstCustomer = null;
    let firstDelivery = null;
    for (const dst of safeArr(route.destinations)) {
        for (const act of safeArr(dst.actions)) {
            const d = act.delivery;
            if (d) {
                firstDelivery = firstDelivery || d;
                if (d.order) {
                    firstOrder = firstOrder || d.order;
                    firstCustomer = firstCustomer || d.order.customer || null;
                }
            }
        }
    }

    // Concatenar números de pedido únicos
    const numerosPedidos = new Set();
    for (const dst of safeArr(route.destinations)) {
        for (const act of safeArr(dst.actions)) {
            const ref = act?.delivery?.order?.reference;
            if (ref) numerosPedidos.add(String(ref));
        }
    }

    // Concatenar números de expedición únicos (delivery.customerShipment)
    const numerosExpedicion = new Set();
    for (const dst of safeArr(route.destinations)) {
        for (const act of safeArr(dst.actions)) {
            const cs = act?.delivery?.customerShipment;
            if (cs) numerosExpedicion.add(String(cs));
        }
    }

    // Concatenar números de albarán únicos
    const numerosAlbaranes = new Set();
    for (const dst of safeArr(route.destinations)) {
        for (const act of safeArr(dst.actions)) {
            for (const cargo of safeArr(act?.delivery?.cargo)) {
                const docNum = cargo?.shippingManifestItem?.shippingManifest?.documentNumber;
                if (docNum) numerosAlbaranes.add(String(docNum));
            }
        }
    }

    return {
        id_viaje: route.id || null,
        id_ruta_externa: null,                              // Satelles no expone
        cliente_codigo: null,                               // se rellena con el tenant en el caller
        cliente_cif: null,
        delegacion_codigo: safeStr(delegation.code),
        email_chofer: safeStr(driver.email),
        email_remitente: null,
        email_otros: null,
        chofer_principal_codigo: safeStr(driver.code),
        chofer_principal_cif: safeStr(driver.idCard),
        chofer_secundario_codigo: null,
        chofer_secundario_cif: null,
        tercero_codigo: safeStr(firstCustomer?.code),
        tercero_cif: safeStr(firstCustomer?.taxCode),
        matricula_tractor: safeStr(tractor.licensePlate),
        matricula_remolque: safeStr(trailer.licensePlate),
        numero_pedido: numerosPedidos.size ? Array.from(numerosPedidos).join(';') : null,
        albaranes_concatenados: numerosAlbaranes.size ? Array.from(numerosAlbaranes).join(';') : null,
        expedicion: numerosExpedicion.size ? Array.from(numerosExpedicion).join(';') : null,
        tipo: 'ALBARAN',                                    // ruta finalizada → albarán
        estado: 'PENDIENTE',
        fecha_plan: route.planDate || null,
        fecha_reparto: firstDelivery?.deliveryDate || (route.startedOn ? route.startedOn.slice(0, 10) : null),
        origen: 'proveedor_externo',
        proveedor_codigo: PROVEEDOR,
        proveedor_publication_id: publication.id || null,
    };
}

function buildAlbaranes(publication) {
    const route = publication.route || {};
    // Deduplicar por shippingManifest.id
    const map = new Map();
    for (const dst of safeArr(route.destinations)) {
        for (const act of safeArr(dst.actions)) {
            for (const cargo of safeArr(act?.delivery?.cargo)) {
                const sm = cargo?.shippingManifestItem?.shippingManifest;
                if (!sm || !sm.id) continue;
                if (!map.has(sm.id)) {
                    map.set(sm.id, {
                        proveedor_codigo: PROVEEDOR,
                        proveedor_albaran_id: sm.id,
                        numero: safeStr(sm.documentNumber) || `SAT-${sm.id}`,
                        fecha: sm.manifestDate || null,
                        lugar_carga_codigo: safeStr(sm.loadingPlace?.code),
                        unidad_medida: safeStr(sm.measureUnit?.code),
                    });
                }
            }
        }
    }
    return Array.from(map.values());
}

function buildParadas(publication) {
    const route = publication.route || {};
    const out = [];
    for (const dst of safeArr(route.destinations)) {
        const place = dst.place || {};
        const pos = dst.position || {};

        // Determinar tipo (CARGA/DESCARGA) por mayoría de actions.type (0=carga, 1=entrega)
        let nCarga = 0, nDescarga = 0;
        for (const act of safeArr(dst.actions)) {
            if (act.type === 0) nCarga += 1;
            else if (act.type === 1) nDescarga += 1;
        }
        let tipo = nDescarga > nCarga ? 'DESCARGA' : 'CARGA';

        // Producto + cantidad: agregar primer cargo encontrado (boceto; mejor desglosar por
        // cada cargo en versión avanzada). Para boceto: una fila por destino.
        let producto = null, cantidad = null, unidad = null;
        for (const act of safeArr(dst.actions)) {
            for (const cargo of safeArr(act?.delivery?.cargo)) {
                producto = producto || safeStr(cargo?.material?.name);
                cantidad = cantidad ?? cargo?.quantity ?? null;
                unidad   = unidad   || safeStr(cargo?.measureUnit?.code);
            }
        }

        // Albarán a vincular: si todos los cargos del destino apuntan al mismo
        // shippingManifest.id, lo guardamos para que el caller lo resuelva contra
        // albaranes.id. Si apuntan a varios o ninguno, dejamos null.
        const sids = new Set();
        for (const act of safeArr(dst.actions)) {
            for (const cargo of safeArr(act?.delivery?.cargo)) {
                const id = cargo?.shippingManifestItem?.shippingManifest?.id;
                if (id) sids.add(id);
            }
        }
        const albaranSatellesId = sids.size === 1 ? Array.from(sids)[0] : null;

        // Satelles entrega `place` mínimo (id + name + area + position GeoJSON).
        // No aporta municipio/provincia/dirección/CP discretos: ese hueco
        // canónico lo cubre la propia tabla `paradas` con lugar_nombre +
        // coordenadas. El visor consolida con COALESCE(municipio, lugar_nombre).
        // `position.coordinates` es GeoJSON [lng, lat].
        out.push({
            // pedido_id y albaran_id los rellena el caller
            albaran_satelles_id: albaranSatellesId,
            reparto_id_externo: dst?.actions?.[0]?.delivery?.id || null,
            tipo,
            orden: tipo === 'CARGA' ? 'ORIGEN' : 'DESTINO',
            secuencia: dst.sequence || null,
            tipo_lugar: safeStr(place.area?.name) || null,
            lugar_codigo: safeStr(place.code) || (place.id != null ? String(place.id) : null),
            lugar_nombre: safeStr(place.name),
            direccion1: safeStr(place.address1),
            direccion2: safeStr(place.address2),
            codigo_postal: safeStr(place.postalCode),
            municipio: safeStr(place.municipality),
            provincia: safeStr(place.province),
            pais: safeStr(place.country),
            telefono: safeStr(place.phone),
            persona_contacto: safeStr(place.contact),
            latitud: Array.isArray(pos.coordinates) ? (pos.coordinates[1] ?? null) : (pos.latitude ?? null),
            longitud: Array.isArray(pos.coordinates) ? (pos.coordinates[0] ?? null) : (pos.longitude ?? null),
            producto,
            cantidad,
            unidad_medida: unidad,
            llegada_prevista: dst.plannedArrival || null,
            salida_prevista: dst.plannedDeparture || null,
            llegada_real: dst.actualArrival || null,
            salida_real: dst.actualDeparture || null,
            kms_tramo: null,    // pendiente: calcular por legs si interesa por tramo
            // Documentos del chofer (albaranes/PDFs/fotos). Satelles los
            // entrega embebidos en cada destino del payload de finished;
            // probado 2026-05-18 que NO hay endpoint /routes/{id}/.../documents
            // separado en ecotrans.satelles.es (404 sin body). Se persiste
            // tal cual; el modal del panel lo lee de BD.
            documentos: Array.isArray(dst.documents) ? dst.documents : [],
        });
    }
    return out;
}

function mapPublication(publication, { tenantCif, tenantCodigo }) {
    const pedido = buildPedido(publication);
    pedido.cliente_codigo = tenantCodigo || null;
    pedido.cliente_cif = tenantCif || null;
    return {
        pedido,
        albaranes: buildAlbaranes(publication),
        paradas: buildParadas(publication),
    };
}

module.exports = { mapPublication, PROVEEDOR };
