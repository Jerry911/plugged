// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The property fields of an element in the Eigenschappen panel of the eendraadschema.
// {key: property of node.p, label: translation key, maxLength}: a field with a maxLength is short: it is drawn on one line with its label,
// as wide as its content, and consecutive short fields are stacked in one block with aligned inputs (Polen is one digit, Curve one letter,
// Beveiliging at most 9999 A).

/** The parts of the main line and the distribution: they are shown bold in the Opbouw list and cannot be turned. */
export const DISTRIBUTION_TYPES = ['aansluiting', 'teller', 'hoofdschakelaar', 'bord', 'diff', 'kring', 'domotica', 'subbord']

const CIRCUIT_FIELDS = [
    {key: 'tekst', label: 'oneWire.fields.name'},
    {key: 'polen', label: 'oneWire.fields.poles', maxLength: 1},
    {key: 'amp', label: 'oneWire.fields.rating', maxLength: 4},
    {key: 'curve', label: 'oneWire.fields.curve', maxLength: 1},
    {key: 'kabel', label: 'oneWire.fields.cable'},
    {key: 'plaatsing', label: 'oneWire.fields.placement'},
    {key: 'kortsl', label: 'oneWire.fields.shortCircuit'},
]
const CONNECTION_FIELDS = [
    {key: 'polen', label: 'oneWire.fields.poles', maxLength: 1},
    {key: 'amp', label: 'oneWire.fields.rating', maxLength: 4},
    {key: 'delta', label: 'oneWire.fields.sensitivity'},
    {key: 'diffType', label: 'oneWire.fields.diffType'},
    {key: 'kabel', label: 'oneWire.fields.cableAfterMeter'},
    {key: 'kortsl', label: 'oneWire.fields.shortCircuit'},
]
const ELEMENT_FIELDS = [
    {key: 'aantal', label: 'oneWire.fields.count'},
    {key: 'nr', label: 'oneWire.fields.number'},
]
// a circuit that is protected by a differentieel has Δ mA and Type instead of the curve
const DIFFERENTIAL_CIRCUIT_FIELDS = CIRCUIT_FIELDS.flatMap((field) =>
    field.key === 'curve'
        ? [
              {key: 'delta', label: 'oneWire.fields.sensitivity', maxLength: 4},
              {key: 'diffType', label: 'oneWire.fields.diffType', maxLength: 2},
          ]
        : [field],
)

/** The fields of an element; a distribution board has none (only the 'earthed' checkbox). */
export const fieldsOf = (node) => {
    if (node.type === 'kring') return node.p?.bescherming === 'differentieel' ? DIFFERENTIAL_CIRCUIT_FIELDS : CIRCUIT_FIELDS
    if (node.type === 'aansluiting') return CONNECTION_FIELDS
    if (node.type === 'bord') return []
    return ELEMENT_FIELDS
}

/** The fields grouped in rows: consecutive short fields share one block {short: true, fields}. */
export const fieldRows = (fields) =>
    fields.reduce((rows, field) => {
        const lastRow = rows[rows.length - 1]
        if (field.maxLength && lastRow?.short) lastRow.fields.push(field)
        else rows.push({short: !!field.maxLength, fields: [field]})
        return rows
    }, [])
