// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {appliesTo, formatDate, parseInstallationDate} from '../../model/installationDate.js'

test('a full date, a month or only a year, in the usual ways of writing them', () => {
    expect(parseInstallationDate('2023')).toEqual({from: '2023-01-01', to: '2023-12-31', precision: 'year'})
    expect(parseInstallationDate(' 06/2023 ')).toEqual({from: '2023-06-01', to: '2023-06-30', precision: 'month'})
    expect(parseInstallationDate('2-2024')).toEqual({from: '2024-02-01', to: '2024-02-29', precision: 'month'})
    expect(parseInstallationDate('2023-06')).toEqual({from: '2023-06-01', to: '2023-06-30', precision: 'month'})
    for (const text of ['1/6/2023', '01/06/2023', '01.06.2023', '1-6-2023', '2023-06-01']) expect(parseInstallationDate(text)).toEqual({from: '2023-06-01', to: '2023-06-01', precision: 'day'})
})
test('empty or not a date: null', () => {
    for (const text of ['', '  ', undefined, null, 'vorig jaar', '31/02/2023', '13/2023', '2023-13-01', '1850', '23']) expect(parseInstallationDate(text)).toBeNull()
})
test('a rule applies from its date; a year or month across it is uncertain; without a date everything applies', () => {
    const since = '2023-06-01'
    expect(appliesTo(since, parseInstallationDate('2022'))).toBe('no')
    expect(appliesTo(since, parseInstallationDate('31/05/2023'))).toBe('no')
    expect(appliesTo(since, parseInstallationDate('01/06/2023'))).toBe('yes')
    expect(appliesTo(since, parseInstallationDate('2024'))).toBe('yes')
    expect(appliesTo(since, parseInstallationDate('2023'))).toBe('maybe')
    expect(appliesTo(since, parseInstallationDate('05/2023'))).toBe('no')
    expect(appliesTo(since, parseInstallationDate('06/2023'))).toBe('yes')
    expect(appliesTo(since, null)).toBe('yes')
    expect(appliesTo(undefined, parseInstallationDate('1990'))).toBe('yes')
    expect(formatDate('2023-06-01')).toBe('01/06/2023')
})
