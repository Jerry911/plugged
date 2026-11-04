// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useTranslation} from '../i18n/I18nProvider.jsx'

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** − 100% + buttons; `idPrefix` makes their ids unique on the page (e.g. 'eds-zoom-1' -> eds-zoom-1-out, -reset, -in). */
export default function ZoomControls({zoom, setZoom, idPrefix, className = 'ui zoomctl', children}) {
    const {t} = useTranslation()
    const levelIndex = ZOOM_LEVELS.indexOf(zoom)
    return (
        <div className={className}>
            {children}
            <button
                id={idPrefix + '-out'}
                title={t('zoom.out')}
                disabled={zoom <= ZOOM_LEVELS[0]}
                onClick={() => setZoom(ZOOM_LEVELS[Math.max(0, levelIndex - 1)])}
            >
                −
            </button>
            <button id={idPrefix + '-reset'} title={t('zoom.reset')} onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
            </button>
            <button
                id={idPrefix + '-in'}
                title={t('zoom.in')}
                disabled={zoom >= ZOOM_LEVELS.at(-1)}
                onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, levelIndex + 1)])}
            >
                +
            </button>
        </div>
    )
}
