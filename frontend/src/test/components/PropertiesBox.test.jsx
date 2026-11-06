// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import {expect, test, vi} from 'vitest'
import {IconButton, PropertiesBox} from '../../components/PropertiesBox.jsx'

test('the Eigenschappen box: heading, close button at the top right, optional subtitle, then its content', () => {
    const onClose = vi.fn()
    const {container, rerender} = render(
        <PropertiesBox id="box" title="Eigenschappen" titleId="box-title" subtitle="Muur" subtitleId="box-sub" closeId="box-close" closeLabel="Sluiten" onClose={onClose} data-tour="x">
            <p>inhoud</p>
        </PropertiesBox>,
    )
    const box = container.querySelector('#box')
    expect(box).toHaveClass('warn', 'props')
    expect(box).toHaveAttribute('data-tour', 'x')
    expect(box.firstElementChild).toContainElement(screen.getByRole('button', {name: 'Sluiten'}))
    expect(container.querySelector('#box-title')).toHaveTextContent('Eigenschappen')
    expect(container.querySelector('#box-sub')).toHaveTextContent('Muur')
    fireEvent.click(container.querySelector('#box-close'))
    expect(onClose).toHaveBeenCalled()
    rerender(<PropertiesBox id="box" title="Eigenschappen" closeLabel="Sluiten" onClose={onClose} />)
    expect(container.querySelector('.props-sub')).toBeNull()
})

test('an icon button: the icon, an optional short text, the hover text and a name for screen readers', () => {
    const onClick = vi.fn()
    const {container} = render(
        <>
            <IconButton id="a" icon={<svg />} text="15°" title="15° draaien" onClick={onClick} />
            <IconButton id="b" icon={<svg />} title="Verwijderen (Del)" label="Verwijderen" />
        </>,
    )
    const a = container.querySelector('#a')
    expect(a).toHaveAttribute('title', '15° draaien')
    expect(a).toHaveAccessibleName('15° draaien')
    expect(a.querySelector('.props-btn-text')).toHaveTextContent('15°')
    fireEvent.click(a)
    expect(onClick).toHaveBeenCalled()
    expect(container.querySelector('#b')).toHaveAccessibleName('Verwijderen')
    expect(container.querySelector('#b .props-btn-text')).toBeNull()
})
