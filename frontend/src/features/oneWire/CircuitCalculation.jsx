// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The calculation of a circuit in its Eigenschappen: the cable length (typed, or the estimate from the situatieschema), the voltage drop and
// the smallest short-circuit current at the end of the cable compared with what makes the breaker trip. See model/calculations.js.
import {circuitCalculation} from '../../model/calculations.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import Icon from '../../components/Icon.jsx'

const fullWidth = {width: '100%', boxSizing: 'border-box'}

export default function CircuitCalculation({project, node, onPropertyChange}) {
    const {t, locale} = useTranslation()
    const result = circuitCalculation(project, node),
        format = (value, digits = 0) => value.toLocaleString(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits}),
        typed = node.p?.lengte ?? ''
    return (
        <div id="eds-calculation" className="calc">
            <label>
                {t('calc.length')}
                <input
                    id="eds-field-lengte"
                    inputMode="decimal"
                    value={typed}
                    placeholder={result?.estimated ? t('calc.estimate', {metres: format(result.length, 1)}) : t('calc.lengthPlaceholder')}
                    onChange={(event) => onPropertyChange('lengte', event.target.value)}
                    style={fullWidth}
                />
            </label>
            {!result && <small id="eds-calc-none">{t('calc.needsSpecs')}</small>}
            {result && (
                <ul className="calclist">
                    {result.lengthKnown ? (
                        <>
                            <li id="eds-calc-drop" className={result.drop > result.dropLimit ? 'bad' : 'good'}>
                                <Icon name={result.drop > result.dropLimit ? 'warning' : 'check'} />{' '}
                                {t('calc.drop', {drop: format(result.drop, 1), limit: result.dropLimit, current: result.current})}
                            </li>
                            <li id="eds-calc-short" className={result.trips ? 'good' : 'bad'}>
                                <Icon name={result.trips ? 'check' : 'warning'} />{' '}
                                {t(result.trips ? 'calc.trips' : 'calc.noTrip', {
                                    current: format(result.shortCircuit),
                                    trip: format(result.tripCurrent),
                                    breaker: result.curve + result.current,
                                })}
                            </li>
                        </>
                    ) : (
                        <li id="eds-calc-unknown">{t('calc.noLength')}</li>
                    )}
                    <li id="eds-calc-max">{t('calc.maxLength', {metres: format(result.maxLength), breaker: result.curve + result.current, section: format(result.section, 1)})}</li>
                </ul>
            )}
            {result && (
                <small id="eds-calc-assumptions">
                    {result.impedanceAssumed ? t('calc.assumedImpedance', {impedance: format(result.impedance, 2)}) : t('calc.impedance', {impedance: format(result.impedance, 2)})}{' '}
                    {t('calc.indicative')}
                </small>
            )}
        </div>
    )
}
