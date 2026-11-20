// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The little markup of the texts: bold, keys, line breaks and the icons of the interface, so a help text shows the button it talks about.
import {render} from '@testing-library/react'
import {renderInline} from '../../i18n/RichText.jsx'
import {ICON_NAMES} from '../../components/Icon.jsx'
import {DICTIONARIES} from '../../i18n/translate.js'

test('bold, a key, an icon and a line break', () => {
    const {container} = render(<p>{renderInline('Klik **Opslaan** of [[Alt]], dan [icon:edit] hernoemen.\nKlaar')}</p>)
    expect(container.querySelector('b')).toHaveTextContent('Opslaan')
    expect(container.querySelector('kbd')).toHaveTextContent('Alt')
    const icon = container.querySelector('svg.ico.inline')
    expect(icon).toHaveAttribute('data-icon', 'edit')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('br')).toBeTruthy()
    expect(container.textContent).toBe('Klik Opslaan of Alt, dan  hernoemen.Klaar')
})

test('every icon a text names exists, in every language', () => {
    const named = new Set()
    const walk = (value) => {
        if (typeof value === 'string') for (const match of value.matchAll(/\[icon:([A-Za-z]+)\]/g)) named.add(match[1])
        else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    Object.values(DICTIONARIES).forEach(walk)
    expect(named.size).toBeGreaterThan(5)
    for (const name of named) expect(ICON_NAMES).toContain(name)
})
