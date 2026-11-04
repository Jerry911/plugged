// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bar above the eendraadschema or the situatieschema: one button per page, add / rename / duplicate / move / delete a page and,
// on the eendraadschema, the Controleer button.
import {defaultTree} from '../model/boardLayout.js'
import {newId, withNewIds} from '../model/tree.js'
import {useTranslation} from '../i18n/I18nProvider.jsx'

/**
 * listKey = 'een' (eendraadschema pages) or 'sit' (situatieschema pages); pageIndex = the page that is shown.
 * verify = {errorCount, warningCount, onToggle} shows the Controleer button.
 */
export default function PageBar({project, setProject, listKey, pageIndex, setPageIndex, verify}) {
    const {t} = useTranslation()
    const pages = project[listKey],
        idPrefix = listKey === 'een' ? 'eds-page' : 'sit-page',
        setPages = (newPages) => setProject({...project, [listKey]: newPages})
    const swapWith = (offset) => {
        const reordered = [...pages]
        ;[reordered[pageIndex], reordered[pageIndex + offset]] = [reordered[pageIndex + offset], reordered[pageIndex]]
        setPages(reordered)
        setPageIndex(pageIndex + offset)
    }
    const newPage = () =>
        listKey === 'een'
            ? {id: newId(), name: t('pages.sheetName', {number: pages.length + 1}), tree: defaultTree()}
            : {id: newId(), name: t('pages.planName', {number: pages.length + 1}), walls: [], items: []}
    const addPage = () => {
        setPages([...pages, newPage()])
        setPageIndex(pages.length)
    }
    const duplicatePage = () => {
        const page = pages[pageIndex],
            copy =
                listKey === 'een'
                    ? {...page, tree: withNewIds(page.tree)}
                    : {...page, walls: page.walls.map((wall) => ({...wall, id: newId()})), items: page.items.map((item) => ({...item, id: newId()}))}
        setPages([...pages.slice(0, pageIndex + 1), {...copy, id: newId(), name: t('common.copyOf', {name: page.name})}, ...pages.slice(pageIndex + 1)])
        setPageIndex(pageIndex + 1)
    }
    const renamePage = () => {
        const name = prompt(t('pages.namePrompt'), pages[pageIndex].name)
        if (name) setPages(pages.map((page, index) => (index === pageIndex ? {...page, name} : page)))
    }
    const deletePage = () => {
        setPages(pages.filter((_, index) => index !== pageIndex))
        setPageIndex(Math.max(0, pageIndex - 1))
    }
    return (
        <div id={idPrefix + 'bar'} className="tb ui" data-tour="pagebar" style={{padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap'}}>
            {pages.map((page, index) => (
                <button key={page.id} id={`${idPrefix}-${index + 1}`} className={index === pageIndex ? 'on' : ''} onClick={() => setPageIndex(index)}>
                    {page.name}
                </button>
            ))}
            <button id={idPrefix + '-add'} onClick={addPage}>
                ＋ {t('pages.add')}
            </button>
            {verify && (
                <button id="btn-verify" onClick={verify.onToggle}>
                    {t('verify.button')}
                    {verify.errorCount ? ` ✖${verify.errorCount}` : ''}
                    {verify.warningCount ? ` ⚠${verify.warningCount}` : ''}
                </button>
            )}
            <button id={idPrefix + '-rename'} title={t('pages.rename')} onClick={renamePage}>
                ✎
            </button>
            <button id={idPrefix + '-duplicate'} title={t('pages.duplicate')} onClick={duplicatePage}>
                ⧉
            </button>
            <button id={idPrefix + '-earlier'} title={t('pages.moveEarlier')} disabled={pageIndex < 1} onClick={() => swapWith(-1)}>
                ◀
            </button>
            <button id={idPrefix + '-later'} title={t('pages.moveLater')} disabled={pageIndex >= pages.length - 1} onClick={() => swapWith(1)}>
                ▶
            </button>
            <button id={idPrefix + '-delete'} title={t('pages.delete')} disabled={pages.length < 2} onClick={deletePage}>
                🗑
            </button>
        </div>
    )
}
