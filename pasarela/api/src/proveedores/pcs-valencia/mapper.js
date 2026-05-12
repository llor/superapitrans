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

    switch (tipo) {
        case 'DUTv2':
            return mapDUT(xml, header, tenantCodigo, meta);
        case 'ReleaseOrderv2':
            return mapReleaseOrder(xml, header, tenantCodigo, meta);
        case 'AcceptanceOrderv2':
            return mapAcceptanceOrder(xml, header, tenantCodigo, meta);
        case 'ReleaseConfirmationv2':
            return mapReleaseConfirmation(xml, header, tenantCodigo, meta);
        case 'AcceptanceConfirmationv2':
            return mapAcceptanceConfirmation(xml, header, tenantCodigo, meta);
        case 'Acknowledgementv2':
            // Estructura aún no muestreada. Persistimos sólo la cabecera
            // para conservar rastro; el sync lo marca para revisar.
            return {
                pedido: basePedido(header, tenantCodigo, 'ALBARAN', parseAllParties(xml)),
                albaranes: [],
                paradas: [],
                _unhandled: true,
            };
        default:
            throw new Error(`pcs-valencia mapMessage: tipo desconocido '${tipo}'`);
    }
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
        tag, tagAll, rawTag, rawTagAll,
    },
};
