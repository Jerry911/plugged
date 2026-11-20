// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The line icons of the interface: decoration unless they tell something on their own, and the counts of problems.
import {render} from '@testing-library/react'
import Icon, {CountBadge, ICON_NAMES} from '../../components/Icon.jsx'

test('an icon is decoration for screen readers, in the colour of the text', () => {
    const {container} = render(<Icon name="delete" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('fill', 'none')
    expect(svg).toHaveClass('ico')
    expect(svg).toHaveAttribute('data-icon', 'delete')
})

test('an icon that tells something on its own has a name; a filled one (the star of an owner) is solid', () => {
    const {container} = render(<Icon name="star" filled label="Eigenaar" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).toHaveAttribute('aria-label', 'Eigenaar')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg).toHaveAttribute('fill', 'currentColor')
})

test('an unknown name draws nothing; every icon has a drawing', () => {
    const {container} = render(<Icon name="nope" />)
    expect(container.innerHTML).toBe('')
    for (const name of ICON_NAMES) expect(render(<Icon name={name} />).container.querySelector('path')).toBeTruthy()
})

test('a count of problems: the icon of its kind and the number', () => {
    const {container} = render(<CountBadge id="errs" kind="error" count={3} title="3 fouten" />)
    const badge = container.querySelector('#errs')
    expect(badge).toHaveClass('count', 'count-error')
    expect(badge).toHaveTextContent(/^3$/)
    expect(badge).toHaveAttribute('title', '3 fouten')
    expect(badge.querySelector('[data-icon="error"]')).toBeTruthy()
})
