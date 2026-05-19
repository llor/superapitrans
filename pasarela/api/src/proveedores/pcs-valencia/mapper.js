/**
 * Mapeo mensajes TRANS de valenciaportpcs.net → 4 tablas canónicas
 * (pedidos, albaranes, paradas) de la BBDD del tenant.
 *
 * Entrada: el XML literal devuelto por
 *   GET /messages/download/{box}/{id}
 * más la metadata de `meta` (proveniente del listado `/download/{box}`):
 *   { id, date, serviceCode, messageType, fileType, messageNumber,
 *     documentNumber, tenantCodigo }
 *
 * Salida: { pedido, albaranes[], paradas[] } listo para upsert.
 *
 * Idempotencia: pedido.proveedor_publication_id = meta.id (header/Number);
 * albaran.proveedor_albaran_id = PCSDocumentNumber.
 *
 * Tipos cubiertos (samples reales en
 *   documentos/pcs-valencia/samples/<TIPO>.txt):
 *   - DUTv2                      (UnifiedInlandTransportDocument)
 *   - ReleaseOrderv2             (ReleaseOrder)
 *   - AcceptanceOrderv2          (AcceptanceOrder)
 *   - ReleaseConfirmationv2      (ReleaseConfirmation)
 *   - AcceptanceConfirmationv2   (AcceptanceConfirmation)
 *   - Acknowledgementv2          (estructura aún sin muestrear; se persiste
 *                                 la cabecera y se marca _unhandled=true).
 */

const PROVEEDOR = 'pcs-valencia';

// ----- helpers regex --------------------------------------------------------
// Los XML de PCS son flat (sin namespaces, sin atributos significativos).
// Tags son únicos en cada contexto, así que basta regex con `[\s\S]*?` para
// abarcar saltos de línea cuando los haya.

function _decodeEntities(s) {
    if (s === null || s === undefined) return s;
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function tag(xml, name) {
    if (!xml) return null;
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
    const m = xml.match(re);
    return m ? _decodeEntities(m[1].trim()) : null;
}

function tagAll(xml, name) {
    if (!xml) return [];
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) {
        out.push(_decodeEntities(m[1].trim()));
    }
    return out;
}

// Devuelve el sub-XML dentro de un tag (sin desencodear, para seguir
// extrayendo hijos).
function rawTag(xml, name) {
    if (!xml) return null;
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
    const m = xml.match(re);
    return m ? m[1] : null;
}

function rawTagAll(xml, name) {
    if (!xml) return [];
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
}

function toDate(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toTimestamp(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ----- estructura común -----------------------------------------------------

function parseHeader(xml) {
    const hdr = rawTag(xml, 'MessageHeader');
    return {
        number:      tag(hdr, 'Number'),
        dateAndTime: tag(hdr, 'DateAndTime'),
        version:     tag(hdr, 'Version'),
        function:    tag(hdr, 'Function'),
        type:        tag(hdr, 'Type'),
        sender:      tag(hdr, 'SenderIdentification'),
        recipient:   tag(hdr, 'RecipientIdentification'),
    };
}

function parseParty(rawPartyXml) {
    if (!rawPartyXml) return null;
    return {
        type:          tag(rawPartyXml, 'Type'),
        pcsCode:       tag(rawPartyXml, 'PCSCode'),
        name:          tag(rawPartyXml, 'Name'),
        cif:           tag(rawPartyXml, 'NationalIdentityNumber'),
        docReference:  tag(rawPartyXml, 'DocumentReference'),
        streetAddress: tag(rawPartyXml, 'StreetAddress'),
        city:          tag(rawPartyXml, 'City'),
        postalCode:    tag(rawPartyXml, 'PostalCode'),
    };
}

function parseAllParties(rawXml) {
    return rawTagAll(rawXml, 'Parties').map(parseParty).filter(Boolean);
}

function findParty(parties, type) {
    return parties.find((p) => p.type === type) || null;
}

function parseRoadTransport(rawXml) {
    const road = rawTag(rawXml, 'RoadTransportDetails');
    if (!road) return null;
    const driver = rawTag(road, 'DriverDetails');
    return {
        truckPlate:       tag(road, 'TruckPlateNumber'),
        entryDateAndTime: tag(road, 'EntryDateAndTime'),
        exitDateAndTime:  tag(road, 'ExitDateAndTime'),
        driverName:       driver ? tag(driver, 'Name') : null,
        driverCif:        driver ? tag(driver, 'NationalIdentityNumber') : null,
    };
}

function parseDatesAndTimes(rawXml) {
    const d = rawTag(rawXml, 'DatesAndTimes');
    if (!d) return null;
    return {
        validFrom:                    tag(d, 'ValidFrom'),
        expiration:                   tag(d, 'Expiration'),
        proposedByContractingCompany: tag(d, 'ProposedByContractingCompany'),
        actual:                       tag(rawXml, 'ActualDateAndTime'),
    };
}

// ----- builders comunes -----------------------------------------------------

function basePedido(header, tenantCodigo, tipo, parties) {
    // Tercero = quien paga / soporta económicamente el movimiento. En el
    // perfil transportista para JSRO esto suele ser el CONTRACTING_PARTY o,
    // en su defecto, el LOGISTICS_OPERATOR / CONTAINER_PROVIDER.
    const tercero =
        findParty(parties, 'CONTRACTING_PARTY')
        || findParty(parties, 'LOGISTICS_OPERATOR')
        || findParty(parties, 'CONTAINER_PROVIDER')
        || null;

    return {
        proveedor_codigo: PROVEEDOR,
        proveedor_publication_id: header.number,
        id_viaje: null,
        id_ruta_externa: header.number,
        cliente_codigo: tenantCodigo,
        cliente_cif: null,
        delegacion_codigo: null,
        tercero_codigo: tercero?.pcsCode || null,
        tercero_cif: tercero?.cif || null,
        tipo,
        estado: 'PENDIENTE',
        origen: 'proveedor_externo',
        fecha_plan: toDate(header.dateAndTime),
        fecha_reparto: toDate(header.dateAndTime),
        chofer_principal_codigo: null,
        chofer_principal_cif: null,
        chofer_secundario_codigo: null,
        chofer_secundario_cif: null,
        matricula_tractor: null,
        matricula_remolque: null,
        numero_pedido: null,
        albaranes_concatenados: null,
    };
}

function paradaDesde(party, opciones) {
    if (!party) return null;
    return {
        reparto_id_externo: opciones?.repartoIdExterno || null,
        tipo: opciones.tipo,                          // 'CARGA' | 'DESCARGA'
        orden: opciones.orden,                        // 'ORIGEN' | 'DESTINO'
        secuencia: opciones?.secuencia ?? null,
        tipo_lugar: party?.type || null,
        lugar_codigo: party?.pcsCode || null,
        lugar_nombre: party?.name || null,
        direccion1: party?.streetAddress || null,
        direccion2: null,
        codigo_postal: party?.postalCode || null,
        municipio: party?.city || null,
        provincia: null,
        pais: null,
        telefono: null,
        persona_contacto: null,
        latitud: null,
        longitud: null,
        producto: opciones?.producto || null,
        cantidad: opciones?.cantidad ?? null,
        unidad_medida: opciones?.unidadMedida || null,
        llegada_prevista: opciones?.llegadaPrevista || null,
        salida_prevista: opciones?.salidaPrevista || null,
        llegada_real: opciones?.llegadaReal || null,
        salida_real: opciones?.salidaReal || null,
        kms_tramo: null,
        albaran_proveedor_id: opciones?.albaranProveedorId || null,
    };
}

// ----- extractores de datos extra (transversales y específicos PCS) --------

function _toNum(s) {
    if (s === null || s === undefined || s === '') return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
}
function _toInt(s) {
    if (s === null || s === undefined || s === '') return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
}
function _toBool(s) {
    if (s === null || s === undefined || s === '') return null;
    return s === 'true' || s === '1' || s === 'TRUE';
}

// Recorre todos los <References>...</References> del XML buscando un tag
// concreto (BLNumber, ForwarderFileNumber, …). El primero que aparezca gana.
function _firstFromAllRefs(xml, name) {
    for (const r of rawTagAll(xml, 'References')) {
        const v = tag(r, name);
        if (v) return v;
    }
    return null;
}

// Busca dentro de <References> primero; si no aparece, cae a `tag(xml, name)`
// global (algunas Confirmations llevan BLNumber suelto, sin envoltorio
// <References>).
function _firstAnywhere(xml, name) {
    return _firstFromAllRefs(xml, name) || tag(xml, name);
}

// Campos transversales que persistimos como columnas de `pedidos`. Estos
// datos pueden interesar a cualquier consumidor (no solo PCS) y van junto
// al resto de la cabecera del pedido. Defensivo: cada tag no existente
// queda como null.
function extractPedidoCommonPcsFields(xml) {
    const docDetails = rawTag(xml, 'DocumentDetails');
    const oceanCarrier = docDetails ? rawTag(docDetails, 'OceanCarrier') : null;
    const vessel = docDetails ? rawTag(docDetails, 'UnloadingVesselDetails') : null;

    // BL y expediente: aparecen en DocumentDetails/References (DUT),
    // dentro de ReleaseDetails/AcceptanceDetails/References (Orders) o
    // sueltos dentro de AcceptanceDetails (Confirmations).
    const blNumero = _firstAnywhere(xml, 'BLNumber');
    const expediente = _firstAnywhere(xml, 'ForwarderFileNumber');

    // Naviera: OceanCarrier (DUT) o ContainerLine dentro de Release/Acceptance
    // Details (Orders y a veces DUT). Cogemos la primera que tenga datos.
    let navieraCodigo = oceanCarrier ? tag(oceanCarrier, 'SCAC') : null;
    let navieraNombre = oceanCarrier ? tag(oceanCarrier, 'Name') : null;
    if (!navieraCodigo || !navieraNombre) {
        for (const c of rawTagAll(xml, 'ContainerLine')) {
            navieraCodigo = navieraCodigo || tag(c, 'Code');
            navieraNombre = navieraNombre || tag(c, 'Name');
            if (navieraCodigo && navieraNombre) break;
        }
    }

    return {
        // Matrícula del contenedor (BOLU5600867…). En DUT/Orders viene
        // dentro de <ContainerDetails>; en Confirmations viene
        // directamente dentro de <ReleaseDetails>/<AcceptanceDetails>.
        // En ambos casos un único <PlateNumber> por mensaje, distinto del
        // <TruckPlateNumber> del camión.
        matricula_contenedor: tag(xml, 'PlateNumber'),
        bl_numero: blNumero,
        expediente_transitario: expediente,
        operacion_tipo: docDetails ? tag(docDetails, 'OperationType') : null,
        naviera_codigo: navieraCodigo,
        naviera_nombre: navieraNombre,
        buque_nombre: vessel ? tag(vessel, 'VesselName') : null,
        viaje_buque: vessel ? tag(vessel, 'VoyageNumber') : null,
    };
}

// Detalle marítimo específico PCS. Se persiste en la tabla 1:1
// `pedidos_pcs_extra`. Devuelve null si el mensaje no aporta ningún campo
// (Confirmations apenas traen extras más allá de matricula/BL, que ya van
// en `pedido`).
function extractPcsExtra(xml) {
    const docDetails = rawTag(xml, 'DocumentDetails');
    const containers = rawTag(xml, 'Containers');
    const containerDetails = containers ? rawTag(containers, 'ContainerDetails') : null;
    const goods = containers ? rawTag(containers, 'Goods') : null;
    const vessel = docDetails ? rawTag(docDetails, 'UnloadingVesselDetails') : null;

    // Puertos por Function (LOADING, ORIGIN).
    let puertoCargaCodigo = null, puertoCargaNombre = null;
    let puertoOrigenCodigo = null, puertoOrigenNombre = null;
    if (docDetails) {
        for (const p of rawTagAll(docDetails, 'Ports')) {
            const fn = tag(p, 'Function');
            if (fn === 'LOADING') {
                puertoCargaCodigo = puertoCargaCodigo || tag(p, 'UNLOCODE');
                puertoCargaNombre = puertoCargaNombre || tag(p, 'Name');
            } else if (fn === 'ORIGIN') {
                puertoOrigenCodigo = puertoOrigenCodigo || tag(p, 'UNLOCODE');
                puertoOrigenNombre = puertoOrigenNombre || tag(p, 'Name');
            }
        }
    }

    // LocatorCode y Seals dentro de Release/Acceptance Details.
    let locatorRelease = null, locatorAcceptance = null;
    let precintoNumero = null, precintoProveedor = null;
    const releaseDet = containers ? rawTag(containers, 'ReleaseDetails') : null;
    const acceptanceDet = containers ? rawTag(containers, 'AcceptanceDetails') : null;
    if (releaseDet) {
        const rr = rawTag(releaseDet, 'References');
        locatorRelease = rr ? tag(rr, 'LocatorCode') : null;
        const seal = rawTag(releaseDet, 'Seals');
        if (seal) {
            precintoNumero = precintoNumero || tag(seal, 'Value');
            precintoProveedor = precintoProveedor || tag(seal, 'Provider');
        }
    }
    if (acceptanceDet) {
        const ar = rawTag(acceptanceDet, 'References');
        locatorAcceptance = ar ? tag(ar, 'LocatorCode') : null;
        const seal = rawTag(acceptanceDet, 'Seals');
        if (seal) {
            precintoNumero = precintoNumero || tag(seal, 'Value');
            precintoProveedor = precintoProveedor || tag(seal, 'Provider');
        }
    }

    // Estado lleno/vacío y pesos del contenedor.
    let fullState = null, releaseState = null, acceptanceState = null;
    let tara = null, pesoBruto = null;
    if (containerDetails) {
        const fos = rawTag(containerDetails, 'FullOrEmptyState');
        if (fos) {
            fullState = tag(fos, 'FullContainerDetails');
            releaseState = tag(fos, 'Release');
            acceptanceState = tag(fos, 'Acceptance');
        }
        const w = rawTag(containerDetails, 'Weights');
        if (w) {
            tara = tag(w, 'Tare');
            pesoBruto = tag(w, 'Gross');
        }
    }

    // Mercancía. Atención: <Goods> tiene un <Description> propio (descripción
    // de la mercancía) Y otro <Description> dentro de <TypeOfPackages>
    // (descripción del tipo de bulto). Para no confundirlos, extraemos
    // TypeOfPackages primero y lo eliminamos del XML antes de buscar el
    // Description de Goods.
    let mercDesc = null, mercPesoBruto = null, mercBultosNum = null;
    let mercTipoCod = null, mercTipoDesc = null;
    if (goods) {
        let goodsXml = goods;
        const top = rawTag(goods, 'TypeOfPackages');
        if (top) {
            mercTipoCod = tag(top, 'Code');
            mercTipoDesc = tag(top, 'Description');
            goodsXml = goodsXml.replace(`<TypeOfPackages>${top}</TypeOfPackages>`, '');
        }
        mercDesc = tag(goodsXml, 'Description');
        mercPesoBruto = tag(goodsXml, 'GrossWeight');
        mercBultosNum = tag(goodsXml, 'NumberOfPackages');
    }

    // Terminal de devolución del contenedor vacío
    // (<AcceptanceDetails><AcceptanceCompany>): organización de admisión del
    // vacío a la que el chofer debe devolver el contenedor al final del
    // viaje. Solo aparece en DUTs con Orden de Entrega; cuando el DUT no
    // la incluye (caso reportado por el puerto el 2026-05-18 para
    // TIBA26051800052093), todos estos campos quedan null y el panel
    // muestra "no incluida".
    let terminalCodigo = null, terminalNombre = null, terminalCif = null;
    let terminalDireccion = null, terminalCiudad = null;
    let terminalCodigoPostal = null, terminalUnlocode = null;
    if (acceptanceDet) {
        const ac = rawTag(acceptanceDet, 'AcceptanceCompany');
        if (ac) {
            terminalCodigo = tag(ac, 'PCSCode');
            terminalNombre = tag(ac, 'Name');
            terminalCif = tag(ac, 'NationalIdentityNumber');
            terminalDireccion = tag(ac, 'StreetAddress');
            terminalCiudad = tag(ac, 'City');
            terminalCodigoPostal = tag(ac, 'PostalCode');
            terminalUnlocode = tag(ac, 'UNLOCODE');
        }
    }

    const out = {
        transporte_tipo: docDetails ? tag(docDetails, 'TransportType') : null,
        transporte_ferroviario: docDetails ? _toBool(tag(docDetails, 'IsRailTransport')) : null,
        locator_release: locatorRelease,
        locator_acceptance: locatorAcceptance,
        berth_request: vessel ? tag(vessel, 'BerthRequestNumber') : null,
        puerto_carga_codigo: puertoCargaCodigo,
        puerto_carga_nombre: puertoCargaNombre,
        puerto_origen_codigo: puertoOrigenCodigo,
        puerto_origen_nombre: puertoOrigenNombre,
        contenedor_iso_tipo: containerDetails ? tag(containerDetails, 'ISOType') : null,
        contenedor_iso_descripcion: containerDetails ? tag(containerDetails, 'ISODescription') : null,
        contenedor_full_state: fullState,
        contenedor_estado_release: releaseState,
        contenedor_estado_acceptance: acceptanceState,
        contenedor_descargado: containerDetails ? _toBool(tag(containerDetails, 'ContainerUnloaded')) : null,
        contenedor_tara: _toNum(tara),
        contenedor_peso_bruto: _toNum(pesoBruto),
        customs_status: containerDetails ? tag(containerDetails, 'CustomsStatus') : null,
        precinto_numero: precintoNumero,
        precinto_proveedor: precintoProveedor,
        mercancia_descripcion: mercDesc,
        mercancia_peso_bruto: _toNum(mercPesoBruto),
        mercancia_bultos_numero: _toInt(mercBultosNum),
        mercancia_bultos_tipo_codigo: mercTipoCod,
        mercancia_bultos_tipo_descripcion: mercTipoDesc,
        terminal_devolucion_codigo: terminalCodigo,
        terminal_devolucion_nombre: terminalNombre,
        terminal_devolucion_cif: terminalCif,
        terminal_devolucion_direccion: terminalDireccion,
        terminal_devolucion_ciudad: terminalCiudad,
        terminal_devolucion_codigo_postal: terminalCodigoPostal,
        terminal_devolucion_unlocode: terminalUnlocode,
    };
    const hasAny = Object.values(out).some((v) => v !== null && v !== undefined);
    return hasAny ? out : null;
}


// ----- mappers por tipo de mensaje ------------------------------------------

function mapAcceptanceConfirmation(xml, header, tenantCodigo, meta) {
    const root = rawTag(xml, 'AcceptanceConfirmation') || xml;
    const parties = parseAllParties(root);
    const det = rawTag(root, 'AcceptanceDetails');
    const docNum = tag(det, 'PCSDocumentNumber');
    const road = parseRoadTransport(det);
    const acceptanceCompany = findParty(parties, 'ACCEPTANCE_COMPANY');

    const pedido = basePedido(header, tenantCodigo, 'ALBARAN', parties);
    pedido.numero_pedido = tag(det, 'BookingNumber');
    pedido.albaranes_concatenados = docNum;
    pedido.matricula_tractor = road?.truckPlate || null;
    pedido.fecha_reparto = toDate(tag(det, 'ActualDateAndTime')) || pedido.fecha_reparto;

    const albaranes = docNum ? [{
        numero: docNum,
        fecha: toDate(tag(det, 'ActualDateAndTime')),
        lugar_carga_codigo: acceptanceCompany?.pcsCode || null,
        unidad_medida: null,
        proveedor_codigo: PROVEEDOR,
        proveedor_albaran_id: docNum,
    }] : [];

    const paradas = [];
    const p = paradaDesde(acceptanceCompany, {
        tipo: 'DESCARGA',
        orden: 'DESTINO',
        secuencia: 1,
        // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
        llegadaReal: toTimestamp(road?.entryDateAndTime),
        salidaReal: toTimestamp(road?.exitDateAndTime),
        albaranProveedorId: docNum,
    });
    if (p) paradas.push(p);

    return { pedido, albaranes, paradas };
}

function mapReleaseConfirmation(xml, header, tenantCodigo, meta) {
    const root = rawTag(xml, 'ReleaseConfirmation') || xml;
    const parties = parseAllParties(root);
    const det = rawTag(root, 'ReleaseDetails');
    const docNum = tag(det, 'PCSDocumentNumber');
    const road = parseRoadTransport(det);
    const releaseCompany = findParty(parties, 'RELEASE_COMPANY');

    const pedido = basePedido(header, tenantCodigo, 'ALBARAN', parties);
    pedido.numero_pedido = tag(det, 'BookingNumber');
    pedido.albaranes_concatenados = docNum;
    pedido.matricula_tractor = road?.truckPlate || null;
    pedido.fecha_reparto = toDate(tag(det, 'ActualDateAndTime')) || pedido.fecha_reparto;

    const albaranes = docNum ? [{
        numero: docNum,
        fecha: toDate(tag(det, 'ActualDateAndTime')),
        lugar_carga_codigo: releaseCompany?.pcsCode || null,
        unidad_medida: null,
        proveedor_codigo: PROVEEDOR,
        proveedor_albaran_id: docNum,
    }] : [];

    const paradas = [];
    const p = paradaDesde(releaseCompany, {
        tipo: 'CARGA',
        orden: 'ORIGEN',
        secuencia: 1,
        // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
        llegadaReal: toTimestamp(road?.entryDateAndTime),
        salidaReal: toTimestamp(road?.exitDateAndTime),
        albaranProveedorId: docNum,
    });
    if (p) paradas.push(p);

    return { pedido, albaranes, paradas };
}

function _extractCommonOrderRefs(rawDoc) {
    const refs = rawTag(rawDoc, 'References');
    return {
        bookingNumber:        tag(refs, 'BookingNumber'),
        blNumber:             tag(refs, 'BLNumber'),
        forwarderFileNumber:  tag(refs, 'ForwarderFileNumber'),
        pcsDocumentNumber:    tag(refs, 'PCSDocumentNumber'),
    };
}

function mapAcceptanceOrder(xml, header, tenantCodigo, meta) {
    const root = rawTag(xml, 'AcceptanceOrder') || xml;
    const docDetails = rawTag(root, 'DocumentDetails') || '';
    const parties = parseAllParties(docDetails);
    const refsTop = _extractCommonOrderRefs(docDetails);

    const containers = rawTag(root, 'Containers') || '';
    const acceptanceDet = rawTag(containers, 'AcceptanceDetails');
    const acceptanceRefs = _extractCommonOrderRefs(acceptanceDet);
    const acceptanceRoad = parseRoadTransport(acceptanceDet);
    const acceptanceDates = parseDatesAndTimes(acceptanceDet);

    const acceptanceCompany = findParty(parties, 'ACCEPTANCE_COMPANY');
    const docNum = acceptanceRefs.pcsDocumentNumber;

    const pedido = basePedido(header, tenantCodigo, 'PEDIDO', parties);
    pedido.numero_pedido = refsTop.bookingNumber || refsTop.forwarderFileNumber;
    pedido.albaranes_concatenados = docNum;
    pedido.matricula_tractor = acceptanceRoad?.truckPlate || null;
    pedido.chofer_principal_codigo = acceptanceRoad?.driverName || null;
    pedido.chofer_principal_cif = acceptanceRoad?.driverCif || null;
    pedido.fecha_plan = toDate(acceptanceDates?.validFrom) || pedido.fecha_plan;
    pedido.fecha_reparto = toDate(acceptanceDates?.proposedByContractingCompany) || pedido.fecha_reparto;

    const albaranes = docNum ? [{
        numero: docNum,
        fecha: toDate(acceptanceDates?.proposedByContractingCompany),
        lugar_carga_codigo: acceptanceCompany?.pcsCode || null,
        unidad_medida: null,
        proveedor_codigo: PROVEEDOR,
        proveedor_albaran_id: docNum,
    }] : [];

    const paradas = [];
    const p = paradaDesde(acceptanceCompany, {
        tipo: 'DESCARGA',
        orden: 'DESTINO',
        secuencia: 1,
        // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
        llegadaPrevista: toTimestamp(acceptanceDates?.proposedByContractingCompany),
        albaranProveedorId: docNum,
    });
    if (p) paradas.push(p);

    return { pedido, albaranes, paradas };
}

function mapReleaseOrder(xml, header, tenantCodigo, meta) {
    const root = rawTag(xml, 'ReleaseOrder') || xml;
    const docDetails = rawTag(root, 'DocumentDetails') || '';
    const parties = parseAllParties(docDetails);
    const refsTop = _extractCommonOrderRefs(docDetails);

    const containers = rawTag(root, 'Containers') || '';
    const releaseDet = rawTag(containers, 'ReleaseDetails');
    const releaseRefs = _extractCommonOrderRefs(releaseDet);
    const releaseRoad = parseRoadTransport(releaseDet);
    const releaseDates = parseDatesAndTimes(releaseDet);

    const releaseCompany = findParty(parties, 'RELEASE_COMPANY');
    const docNum = releaseRefs.pcsDocumentNumber;

    const pedido = basePedido(header, tenantCodigo, 'PEDIDO', parties);
    pedido.numero_pedido = refsTop.bookingNumber || refsTop.forwarderFileNumber;
    pedido.albaranes_concatenados = docNum;
    pedido.matricula_tractor = releaseRoad?.truckPlate || null;
    pedido.chofer_principal_codigo = releaseRoad?.driverName || null;
    pedido.chofer_principal_cif = releaseRoad?.driverCif || null;
    pedido.fecha_plan = toDate(releaseDates?.validFrom) || pedido.fecha_plan;
    pedido.fecha_reparto = toDate(releaseDates?.proposedByContractingCompany) || pedido.fecha_reparto;

    const albaranes = docNum ? [{
        numero: docNum,
        fecha: toDate(releaseDates?.proposedByContractingCompany),
        lugar_carga_codigo: releaseCompany?.pcsCode || null,
        unidad_medida: null,
        proveedor_codigo: PROVEEDOR,
        proveedor_albaran_id: docNum,
    }] : [];

    const paradas = [];
    const p = paradaDesde(releaseCompany, {
        tipo: 'CARGA',
        orden: 'ORIGEN',
        secuencia: 1,
        // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
        salidaPrevista: toTimestamp(releaseDates?.proposedByContractingCompany),
        albaranProveedorId: docNum,
    });
    if (p) paradas.push(p);

    return { pedido, albaranes, paradas };
}

function mapDUT(xml, header, tenantCodigo, meta) {
    const root = rawTag(xml, 'UnifiedInlandTransportDocument') || xml;
    const docDetails = rawTag(root, 'DocumentDetails') || '';
    const parties = parseAllParties(docDetails);
    const refsTop = _extractCommonOrderRefs(docDetails);

    const containers = rawTag(root, 'Containers') || '';
    const releaseDet = rawTag(containers, 'ReleaseDetails');
    const acceptanceDet = rawTag(containers, 'AcceptanceDetails');
    const loadUnload = rawTag(containers, 'LoadingUnloadingDetails');

    const releaseRefs = _extractCommonOrderRefs(releaseDet);
    const acceptanceRefs = _extractCommonOrderRefs(acceptanceDet);
    const releaseRoad = parseRoadTransport(releaseDet);
    const acceptanceRoad = parseRoadTransport(acceptanceDet);
    const releaseDates = parseDatesAndTimes(releaseDet);
    const acceptanceDates = parseDatesAndTimes(acceptanceDet);

    const releaseCompanyRaw = rawTag(releaseDet, 'ReleaseCompany');
    const acceptanceCompanyRaw = rawTag(acceptanceDet, 'AcceptanceCompany');
    const releaseCompany = releaseCompanyRaw ? parseParty(releaseCompanyRaw) : null;
    const acceptanceCompany = acceptanceCompanyRaw ? parseParty(acceptanceCompanyRaw) : null;

    const docNums = [releaseRefs.pcsDocumentNumber, acceptanceRefs.pcsDocumentNumber, refsTop.pcsDocumentNumber]
        .filter(Boolean);
    const docNumConcat = docNums.length ? [...new Set(docNums)].join(';') : null;

    // Funciones REPLACE / CHANGE_ITD / NEW = orden de transporte → PEDIDO.
    const pedido = basePedido(header, tenantCodigo, 'PEDIDO', parties);
    pedido.numero_pedido = refsTop.bookingNumber || refsTop.pcsDocumentNumber;
    pedido.albaranes_concatenados = docNumConcat;
    pedido.matricula_tractor = releaseRoad?.truckPlate || acceptanceRoad?.truckPlate || null;
    pedido.chofer_principal_codigo = releaseRoad?.driverName || acceptanceRoad?.driverName || null;
    pedido.chofer_principal_cif = releaseRoad?.driverCif || acceptanceRoad?.driverCif || null;
    pedido.fecha_plan = toDate(releaseDates?.validFrom) || toDate(acceptanceDates?.validFrom) || pedido.fecha_plan;
    pedido.fecha_reparto = toDate(releaseDates?.proposedByContractingCompany)
        || toDate(acceptanceDates?.proposedByContractingCompany) || pedido.fecha_reparto;

    const albaranes = [];
    if (releaseRefs.pcsDocumentNumber) {
        albaranes.push({
            numero: releaseRefs.pcsDocumentNumber,
            fecha: toDate(releaseDates?.proposedByContractingCompany),
            lugar_carga_codigo: releaseCompany?.pcsCode || null,
            unidad_medida: null,
            proveedor_codigo: PROVEEDOR,
            proveedor_albaran_id: releaseRefs.pcsDocumentNumber,
        });
    }
    if (acceptanceRefs.pcsDocumentNumber && acceptanceRefs.pcsDocumentNumber !== releaseRefs.pcsDocumentNumber) {
        albaranes.push({
            numero: acceptanceRefs.pcsDocumentNumber,
            fecha: toDate(acceptanceDates?.proposedByContractingCompany),
            lugar_carga_codigo: acceptanceCompany?.pcsCode || null,
            unidad_medida: null,
            proveedor_codigo: PROVEEDOR,
            proveedor_albaran_id: acceptanceRefs.pcsDocumentNumber,
        });
    }

    const paradas = [];
    if (releaseCompany) {
        const p = paradaDesde(releaseCompany, {
            tipo: 'CARGA',
            orden: 'ORIGEN',
            secuencia: 1,
            // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
            salidaPrevista: toTimestamp(releaseDates?.proposedByContractingCompany),
            albaranProveedorId: releaseRefs.pcsDocumentNumber,
        });
        if (p) paradas.push(p);
    }
    // El DUT trae además LoadingUnloadingDetails (dirección del cliente
    // final). Lo damos preferencia sobre AcceptanceCompany (que suele ser
    // sólo la terminal logística intermedia).
    if (loadUnload) {
        const ll = {
            type: null, pcsCode: null,
            name: tag(loadUnload, 'LocationName'),
            cif: null,
            streetAddress: tag(loadUnload, 'StreetAddress'),
            city: tag(loadUnload, 'City'),
            postalCode: tag(loadUnload, 'PostalCode'),
            docReference: null,
        };
        const proposed = tag(rawTag(loadUnload, 'DatesAndTimes'), 'ProposedByContractingCompany');
        const p = paradaDesde(ll, {
            tipo: 'DESCARGA',
            orden: 'DESTINO',
            secuencia: 2,
            // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
            llegadaPrevista: toTimestamp(proposed),
            albaranProveedorId: acceptanceRefs.pcsDocumentNumber || releaseRefs.pcsDocumentNumber,
        });
        if (p) paradas.push(p);
    } else if (acceptanceCompany) {
        const p = paradaDesde(acceptanceCompany, {
            tipo: 'DESCARGA',
            orden: 'DESTINO',
            secuencia: 2,
            // reparto_id_externo es BIGINT (Satelles lo usaba), PCS no tiene
        // equivalente numérico; lo dejamos null.
        repartoIdExterno: null,
            llegadaPrevista: toTimestamp(acceptanceDates?.proposedByContractingCompany),
            albaranProveedorId: acceptanceRefs.pcsDocumentNumber,
        });
        if (p) paradas.push(p);
    }

    return { pedido, albaranes, paradas };
}

// ----- dispatcher -----------------------------------------------------------

function mapMessage(xml, meta) {
    if (!xml || typeof xml !== 'string') {
        throw new Error('pcs-valencia mapMessage: xml requerido');
    }
    const tipo = meta?.messageType || '';
    const header = parseHeader(xml);
    if (!header.number) {
        throw new Error(`pcs-valencia mapMessage: MessageHeader/Number ausente en ${tipo || 'mensaje'}`);
    }
    const tenantCodigo = meta?.tenantCodigo;
    if (!tenantCodigo) {
        throw new Error('pcs-valencia mapMessage: meta.tenantCodigo requerido');
    }

    let result;
    switch (tipo) {
        case 'DUTv2':
            result = mapDUT(xml, header, tenantCodigo, meta);
            break;
        case 'ReleaseOrderv2':
            result = mapReleaseOrder(xml, header, tenantCodigo, meta);
            break;
        case 'AcceptanceOrderv2':
            result = mapAcceptanceOrder(xml, header, tenantCodigo, meta);
            break;
        case 'ReleaseConfirmationv2':
            result = mapReleaseConfirmation(xml, header, tenantCodigo, meta);
            break;
        case 'AcceptanceConfirmationv2':
            result = mapAcceptanceConfirmation(xml, header, tenantCodigo, meta);
            break;
        case 'Acknowledgementv2':
            // Estructura aún no muestreada. Persistimos sólo la cabecera
            // para conservar rastro; el sync lo marca para revisar.
            result = {
                pedido: basePedido(header, tenantCodigo, 'ALBARAN', parseAllParties(xml)),
                albaranes: [],
                paradas: [],
                _unhandled: true,
            };
            break;
        default:
            throw new Error(`pcs-valencia mapMessage: tipo desconocido '${tipo}'`);
    }

    // Inyectar campos transversales PCS al pedido (matrícula contenedor,
    // BL, expediente, naviera, buque, etc.) y devolver el detalle marítimo
    // específico como `pcsExtra` para que el sync lo persista en la tabla
    // anexa `pedidos_pcs_extra`.
    if (result && result.pedido) {
        Object.assign(result.pedido, extractPedidoCommonPcsFields(xml));
    }
    if (result) {
        result.pcsExtra = extractPcsExtra(xml);
    }
    return result;
}

module.exports = {
    PROVEEDOR,
    mapMessage,
    // exportados para tests:
    _internal: {
        parseHeader, parseAllParties, parseParty, findParty,
        parseRoadTransport, parseDatesAndTimes,
        mapDUT, mapReleaseOrder, mapAcceptanceOrder,
        mapReleaseConfirmation, mapAcceptanceConfirmation,
        extractPedidoCommonPcsFields, extractPcsExtra,
        tag, tagAll, rawTag, rawTagAll,
    },
};
