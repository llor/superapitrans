/**
 * Tests del mapper PCS Valencia.
 *
 * Cobertura: las 5 ramas con sample XML real comprobadas contra valores
 * esperados de los XMLs descargados de prod el 2026-05-12 (carpeta
 * `superapitrans/documentos/pcs-valencia/samples/`). Aquí van embebidos
 * porque la suite del pasarela_api corre dentro del contenedor (que solo
 * copia `api/`).
 *
 * REGLA OPERATIVA: si añades un mensaje nuevo (Acknowledgementv2 cuando
 * aparezca, InlandTransportDetailsv2 outbound, etc.), añade su test aquí
 * Y revisa que el manual ApiDocsPasarela.jsx mencione el cambio.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapMessage } = require('../src/proveedores/pcs-valencia/mapper');

// XML representativos. Si necesitas el XML completo, está en
// `superapitrans/documentos/pcs-valencia/samples/<TIPO>.txt`.

const XML_ACCEPTANCE_CONFIRMATION = `<?xml version="1.0" encoding="UTF-8"?><AcceptanceConfirmation><MessageHeader><SenderIdentification>VALENCIAPORT</SenderIdentification><RecipientIdentification>JSRO</RecipientIdentification><Number>VPRT6136551210</Number><DateAndTime>2026-05-04T14:45:16</DateAndTime><Version>1.1</Version></MessageHeader><Parties><Type>ACCEPTANCE_COMPANY</Type><PCSCode>MVAL</PCSCode><Name>CSP IBERIAN VALENCIA TERMINAL</Name><NationalIdentityNumber>A46604815</NationalIdentityNumber><StreetAddress>Terminal Príncipe Felipe s/n</StreetAddress><City>Valencia</City><PostalCode>46024</PostalCode></Parties><Parties><Type>CONTAINER_PROVIDER</Type><PCSCode>T077</PCSCode><Name>HAPAG-LLOYD SPAIN, S.L.</Name><NationalIdentityNumber>B41038977</NationalIdentityNumber></Parties><AcceptanceDetails><PCSDocumentNumber>T07726043000427718</PCSDocumentNumber><BookingNumber>31726041</BookingNumber><BLNumber>HLCUBC1260458179</BLNumber><PlateNumber>SEGU5704845</PlateNumber><FullOrEmptyState>FULL</FullOrEmptyState><ActualDateAndTime>2026-05-04T14:37:00</ActualDateAndTime><RoadTransportDetails><TruckPlateNumber>7579LJX</TruckPlateNumber><EntryDateAndTime>2026-05-04T14:29:00</EntryDateAndTime><ExitDateAndTime>2026-05-04T14:41:00</ExitDateAndTime></RoadTransportDetails></AcceptanceDetails></AcceptanceConfirmation>`;

const XML_RELEASE_CONFIRMATION = `<?xml version="1.0" encoding="UTF-8"?><ReleaseConfirmation><MessageHeader><SenderIdentification>VALENCIAPORT</SenderIdentification><RecipientIdentification>JSRO</RecipientIdentification><Number>VPRT6136571962</Number><DateAndTime>2026-05-04T15:08:31</DateAndTime><Version>1.1</Version></MessageHeader><Parties><Type>CONTAINER_PROVIDER</Type><PCSCode>WHMA</PCSCode><Name>W.E.C. LINES ESPAÑA, S.L.U.</Name><NationalIdentityNumber>B64642093</NationalIdentityNumber></Parties><Parties><Type>RELEASE_COMPANY</Type><PCSCode>TBSP</PCSCode><Name>TRANS-BASE SOLER, S.L. (PUERTO)</Name><NationalIdentityNumber>B97129530P</NationalIdentityNumber><StreetAddress>Ampliación Norte, S/N</StreetAddress><City>Valencia</City><PostalCode>46024</PostalCode></Parties><ReleaseDetails><PCSDocumentNumber>WHMA26043000062361</PCSDocumentNumber><BookingNumber>107858-TE682182</BookingNumber><PlateNumber>CNEU4590147</PlateNumber><FullOrEmptyState>EMPTY</FullOrEmptyState><ActualDateAndTime>2026-05-04T15:03:00</ActualDateAndTime><RoadTransportDetails><TruckPlateNumber>1482LKK</TruckPlateNumber></RoadTransportDetails></ReleaseDetails></ReleaseConfirmation>`;

const XML_ACCEPTANCE_ORDER = `<?xml version="1.0" encoding="UTF-8"?><AcceptanceOrder><MessageHeader><SenderIdentification>VALENCIAPORT</SenderIdentification><RecipientIdentification>JSRO</RecipientIdentification><Number>VPRT6136855653</Number><DateAndTime>2026-05-05T08:59:39</DateAndTime><Version>1.1</Version><Function>CHANGE_ITD</Function></MessageHeader><DocumentDetails><OperationType>EXPORT</OperationType><References><BookingNumber>107858-TE682306</BookingNumber></References><Parties><Type>CONTAINER_PROVIDER</Type><PCSCode>WHMA</PCSCode><Name>W.E.C. LINES ESPAÑA, S.L.U.</Name><NationalIdentityNumber>B64642093</NationalIdentityNumber></Parties><Parties><Type>ACCEPTANCE_COMPANY</Type><PCSCode>SFSL</PCSCode><Name>CENTRO LOGISTICO SAN LUIS</Name><NationalIdentityNumber>U75578187</NationalIdentityNumber><StreetAddress>CARRETERA DE FONT D'EN CORTS S/N 46013 VALENCIA</StreetAddress><City>46013 VALENCIA</City><PostalCode>46021</PostalCode></Parties></DocumentDetails><Containers><ContainerDetails><PlateNumber>CNEU4574763</PlateNumber></ContainerDetails><AcceptanceDetails><References><PCSDocumentNumber>WHMA26050400062584</PCSDocumentNumber></References><DatesAndTimes><ValidFrom>2026-05-04T00:00:00</ValidFrom><ProposedByContractingCompany>2026-05-05T00:00:00</ProposedByContractingCompany></DatesAndTimes><RoadTransportDetails><TruckPlateNumber>1660LGH</TruckPlateNumber><DriverDetails><Name>Victor Lopez Lopez</Name><NationalIdentityNumber>***0561**</NationalIdentityNumber></DriverDetails></RoadTransportDetails></AcceptanceDetails></Containers></AcceptanceOrder>`;

const XML_RELEASE_ORDER = `<?xml version="1.0" encoding="UTF-8"?><ReleaseOrder><MessageHeader><SenderIdentification>VALENCIAPORT</SenderIdentification><RecipientIdentification>JSRO</RecipientIdentification><Number>VPRT6136855667</Number><DateAndTime>2026-05-05T08:59:39</DateAndTime><Version>1.1</Version><Function>CHANGE_ITD</Function></MessageHeader><DocumentDetails><OperationType>EXPORT</OperationType><References><BookingNumber>107858-TE682306</BookingNumber></References><Parties><Type>TRANSPORT_OPERATOR</Type><PCSCode>JSRO</PCSCode><Name>JASARO SL</Name><NationalIdentityNumber>B16189946</NationalIdentityNumber></Parties><Parties><Type>RELEASE_COMPANY</Type><PCSCode>DKCV</PCSCode><Name>DOCKS LOGISTICS SPAIN, S.A.</Name><NationalIdentityNumber>A81395220B</NationalIdentityNumber><StreetAddress>Parque Logístico, Fase II Manzana 16/2</StreetAddress><City>Ribarroja</City><PostalCode>46190</PostalCode></Parties></DocumentDetails><Containers><ContainerDetails><PlateNumber>CNEU4574763</PlateNumber></ContainerDetails><ReleaseDetails><References><PCSDocumentNumber>WHMA26050400062585</PCSDocumentNumber></References><DatesAndTimes><ValidFrom>2026-05-04T00:00:00</ValidFrom><ProposedByContractingCompany>2026-05-05T00:00:00</ProposedByContractingCompany></DatesAndTimes><RoadTransportDetails><TruckPlateNumber>1660LGH</TruckPlateNumber><DriverDetails><Name>Victor Lopez Lopez</Name><NationalIdentityNumber>***0561**</NationalIdentityNumber></DriverDetails></RoadTransportDetails></ReleaseDetails></Containers></ReleaseOrder>`;

const XML_DUT = `<?xml version="1.0" encoding="UTF-8"?><UnifiedInlandTransportDocument><MessageHeader><SenderIdentification>VALENCIAPORT</SenderIdentification><RecipientIdentification>JSRO</RecipientIdentification><Number>VPRT6136554289</Number><DateAndTime>2026-05-04T14:49:40</DateAndTime><Type>COMPLETE</Type><Version>1.1</Version><Function>REPLACE</Function></MessageHeader><DocumentDetails><OperationType>IMPORT</OperationType><References><PCSDocumentNumber>MLYC26042800248984</PCSDocumentNumber><BookingNumber>51202610343001</BookingNumber><BLNumber>68640704660000</BLNumber></References><Parties><Type>CONTRACTING_PARTY</Type><PCSCode>MLYC</PCSCode><Name>MILLER Y CIA</Name><NationalIdentityNumber>A35000058</NationalIdentityNumber></Parties><Parties><Type>CONTAINER_PROVIDER</Type><PCSCode>MLYC</PCSCode><Name>MILLER Y CIA</Name><NationalIdentityNumber>A35000058</NationalIdentityNumber></Parties></DocumentDetails><Containers><ContainerDetails><PlateNumber>BOLU5600867</PlateNumber><LoadingUnloadingDetails><LocationName>CTR MEDITERRANEO</LocationName><StreetAddress>P.I.CASETAS BLANCA</StreetAddress><City>VALL D ALBA</City><PostalCode>46000</PostalCode><DatesAndTimes><ProposedByContractingCompany>2026-05-05T08:00:00</ProposedByContractingCompany></DatesAndTimes></LoadingUnloadingDetails></ContainerDetails><ReleaseDetails><ReleaseCompany><PCSCode>MVAL</PCSCode><Name>NOATUM CONTAINER TERMINAL VALENCIA</Name><NationalIdentityNumber>A46604815</NationalIdentityNumber><StreetAddress>MUELLE PRINCIPE FELIPE</StreetAddress><City>VALENCIA</City><PostalCode>46014</PostalCode></ReleaseCompany><References><PCSDocumentNumber>MLYC26042800248985</PCSDocumentNumber></References><DatesAndTimes><ValidFrom>2026-05-04T00:00:00</ValidFrom><ProposedByContractingCompany>2026-05-05T08:00:00</ProposedByContractingCompany></DatesAndTimes><RoadTransportDetails><TruckPlateNumber>1479LKK</TruckPlateNumber><DriverDetails><Name>GONZALVEZ</Name></DriverDetails></RoadTransportDetails></ReleaseDetails><AcceptanceDetails><AcceptanceCompany><PCSCode>DETO</PCSCode><Name>GRUPO TORRES</Name><NationalIdentityNumber>B96315320D</NationalIdentityNumber><StreetAddress>C/RIU MOLINER S/N</StreetAddress><City>ALDAYA</City><PostalCode>46960</PostalCode></AcceptanceCompany><References><PCSDocumentNumber>MLYC26042800248986</PCSDocumentNumber></References><DatesAndTimes><ValidFrom>2026-05-04T00:00:00</ValidFrom><ProposedByContractingCompany>2026-05-05T08:00:00</ProposedByContractingCompany></DatesAndTimes></AcceptanceDetails></Containers></UnifiedInlandTransportDocument>`;

test('pcs-valencia mapper → AcceptanceConfirmationv2', () => {
    const r = mapMessage(XML_ACCEPTANCE_CONFIRMATION, {
        id: 'VPRT6136551210',
        messageType: 'AcceptanceConfirmationv2',
        tenantCodigo: 'JSR',
    });
    assert.equal(r.pedido.proveedor_codigo, 'pcs-valencia');
    assert.equal(r.pedido.proveedor_publication_id, 'VPRT6136551210');
    assert.equal(r.pedido.tipo, 'ALBARAN');
    assert.equal(r.pedido.estado, 'PENDIENTE');
    assert.equal(r.pedido.numero_pedido, '31726041');
    assert.equal(r.pedido.matricula_tractor, '7579LJX');
    assert.equal(r.pedido.albaranes_concatenados, 'T07726043000427718');
    assert.equal(r.pedido.tercero_codigo, 'T077');
    assert.equal(r.pedido.tercero_cif, 'B41038977');
    assert.equal(r.pedido.cliente_codigo, 'JSR');
    assert.equal(r.albaranes.length, 1);
    assert.equal(r.albaranes[0].proveedor_albaran_id, 'T07726043000427718');
    assert.equal(r.paradas.length, 1);
    assert.equal(r.paradas[0].tipo, 'DESCARGA');
    assert.equal(r.paradas[0].orden, 'DESTINO');
    assert.equal(r.paradas[0].lugar_codigo, 'MVAL');
    assert.equal(r.paradas[0].municipio, 'Valencia');
    assert.equal(r.paradas[0].codigo_postal, '46024');
});

test('pcs-valencia mapper → ReleaseConfirmationv2', () => {
    const r = mapMessage(XML_RELEASE_CONFIRMATION, {
        id: 'VPRT6136571962',
        messageType: 'ReleaseConfirmationv2',
        tenantCodigo: 'JSR',
    });
    assert.equal(r.pedido.tipo, 'ALBARAN');
    assert.equal(r.pedido.matricula_tractor, '1482LKK');
    assert.equal(r.pedido.albaranes_concatenados, 'WHMA26043000062361');
    assert.equal(r.albaranes.length, 1);
    assert.equal(r.paradas.length, 1);
    assert.equal(r.paradas[0].tipo, 'CARGA');
    assert.equal(r.paradas[0].orden, 'ORIGEN');
    assert.equal(r.paradas[0].lugar_codigo, 'TBSP');
});

test('pcs-valencia mapper → AcceptanceOrderv2', () => {
    const r = mapMessage(XML_ACCEPTANCE_ORDER, {
        id: 'VPRT6136855653',
        messageType: 'AcceptanceOrderv2',
        tenantCodigo: 'JSR',
    });
    assert.equal(r.pedido.tipo, 'PEDIDO');
    assert.equal(r.pedido.numero_pedido, '107858-TE682306');
    assert.equal(r.pedido.matricula_tractor, '1660LGH');
    assert.equal(r.pedido.albaranes_concatenados, 'WHMA26050400062584');
    assert.equal(r.pedido.chofer_principal_codigo, 'Victor Lopez Lopez');
    assert.equal(r.pedido.fecha_plan, '2026-05-03');
    assert.equal(r.pedido.fecha_reparto, '2026-05-04');
    assert.equal(r.paradas.length, 1);
    assert.equal(r.paradas[0].tipo, 'DESCARGA');
    assert.equal(r.paradas[0].lugar_codigo, 'SFSL');
});

test('pcs-valencia mapper → ReleaseOrderv2', () => {
    const r = mapMessage(XML_RELEASE_ORDER, {
        id: 'VPRT6136855667',
        messageType: 'ReleaseOrderv2',
        tenantCodigo: 'JSR',
    });
    assert.equal(r.pedido.tipo, 'PEDIDO');
    assert.equal(r.pedido.numero_pedido, '107858-TE682306');
    assert.equal(r.pedido.matricula_tractor, '1660LGH');
    assert.equal(r.pedido.albaranes_concatenados, 'WHMA26050400062585');
    assert.equal(r.paradas.length, 1);
    assert.equal(r.paradas[0].tipo, 'CARGA');
    assert.equal(r.paradas[0].lugar_codigo, 'DKCV');
});

test('pcs-valencia mapper → DUTv2 (con LoadingUnloadingDetails)', () => {
    const r = mapMessage(XML_DUT, {
        id: 'VPRT6136554289',
        messageType: 'DUTv2',
        tenantCodigo: 'JSR',
    });
    assert.equal(r.pedido.tipo, 'PEDIDO');
    assert.equal(r.pedido.numero_pedido, '51202610343001');
    assert.equal(r.pedido.matricula_tractor, '1479LKK');
    assert.equal(r.pedido.chofer_principal_codigo, 'GONZALVEZ');
    // 2 albaranes (MLYC ...62...85 release + 86 acceptance)
    assert.equal(r.albaranes.length, 2);
    // 2 paradas: CARGA en NOATUM (terminal) + DESCARGA en LoadingUnloadingDetails (CTR MEDITERRANEO)
    assert.equal(r.paradas.length, 2);
    assert.equal(r.paradas[0].tipo, 'CARGA');
    assert.equal(r.paradas[0].lugar_nombre, 'NOATUM CONTAINER TERMINAL VALENCIA');
    assert.equal(r.paradas[1].tipo, 'DESCARGA');
    assert.equal(r.paradas[1].lugar_nombre, 'CTR MEDITERRANEO');
});

test('pcs-valencia mapper → tipo desconocido tira error claro', () => {
    assert.throws(
        () => mapMessage('<?xml version="1.0"?><Foo><MessageHeader><Number>X</Number></MessageHeader></Foo>',
                         { id: 'X', messageType: 'Inventadov2', tenantCodigo: 'JSR' }),
        /tipo desconocido 'Inventadov2'/,
    );
});

test('pcs-valencia mapper → falta tenantCodigo tira error', () => {
    assert.throws(
        () => mapMessage(XML_ACCEPTANCE_CONFIRMATION, { id: 'X', messageType: 'AcceptanceConfirmationv2' }),
        /tenantCodigo requerido/,
    );
});

test('pcs-valencia mapper → falta Number en cabecera tira error', () => {
    assert.throws(
        () => mapMessage('<?xml version="1.0"?><AcceptanceConfirmation><MessageHeader></MessageHeader></AcceptanceConfirmation>',
                         { id: 'X', messageType: 'AcceptanceConfirmationv2', tenantCodigo: 'JSR' }),
        /MessageHeader\/Number ausente/,
    );
});
