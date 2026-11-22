// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// A choice of an article of the price list, by group.
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {ARTICLE_GROUPS} from '../../model/pricing.js'

export default function ArticleSelect({id, articles, value, onChange, empty, label}) {
    const {t} = useTranslation()
    const groups = ARTICLE_GROUPS.map((group) => [group, articles.filter((article) => (article.group || 'other') === group)]).filter(([, list]) => list.length)
    return (
        <select id={id} value={value || ''} aria-label={label} onChange={(event) => onChange(event.target.value)}>
            <option value="">{empty ?? t('pricing.none')}</option>
            {groups.map(([group, list]) => (
                <optgroup key={group} label={t('pricing.groups.' + group)}>
                    {list.map((article) => (
                        <option key={article.id} value={article.id}>
                            {article.name || article.code || article.id}
                        </option>
                    ))}
                </optgroup>
            ))}
            {value && !articles.some((article) => article.id === value) && <option value={value}>{t('pricing.missingArticle')}</option>}
        </select>
    )
}
