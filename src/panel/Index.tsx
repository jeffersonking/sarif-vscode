import { action, autorun, IObservableValue, IReactionDisposer, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component, Fragment } from 'react'
import '../shared/extension'
import './codicon.css'
import { Details } from './Details'
import './Index.scss'
import { Badge, Checkrow, css, Hi, Icon, Popover, renderMessageWithEmbeddedLinks, ResizeHandle, TabBar, TabPanel } from './Index.widgets'
import { column, Group, SortDir, Store, postSelectArtifact } from './Store'
import { ResultTable } from './ResultTable'
import { ReportingDescriptor } from 'sarif'
import { RowItem } from './TableStore'
import { FilterKeywordContext } from './FilterKeywordContext'

export * as React from 'react'
export * as ReactDOM from 'react-dom'
export { Store } from './Store'

const levelToIcon = {
	error: 'error',
	warning: 'warning',
	note: 'info',
	none: 'issues',
	undefined: 'question',
}

@observer export class Index extends Component<{ store: Store }> {
	private showFilterPopup = observable.box(false)
	private detailsPaneHeight = observable.box(300)

	private columnWidths = new Map<column, IObservableValue<number>>([
		['Line', observable.box(50)],
		['Message', observable.box(300)],
		['Baseline', observable.box(100)],
		['Suppression', observable.box(100)],
	])
	private columnWidth(name: column) {
		if (!this.columnWidths.has(name)) this.columnWidths.set(name, observable.box(220))
		return this.columnWidths.get(name)
	}

	render() {
		const {store} = this.props
		if (!store.logs.length) {
			return <div className="svZeroData">
				<div onClick={() => vscode.postMessage({ command: 'open' })}>
					Open SARIF file
				</div>
			</div>
		}

		const {logs, selectedTab, groupBy, rows, sortColumn, sortDir, visibleColumns, groupsFilteredSorted, keywords} = store
		const {showFilterPopup, detailsPaneHeight} = this
		const allCollapsed = groupsFilteredSorted.every(group => !group.expanded)
		const columns = visibleColumns
		// const selected = store.selectedItem?.data
		const selectedRow = this.props.store.selection2.get()
		const selected = selectedRow instanceof RowItem && selectedRow.item
		return <FilterKeywordContext.Provider value={keywords ?? ''}>
			<div className="svListPane">
				<div className="svListHeader">
					<TabBar titles={store.tabs} selection={store.selectedTab} />
						<div className="flexFill"></div>
						<div className="svFilterCombo">
							<input type="text" placeholder="Filter results" value={store.keywords}
								onChange={e => store.keywords = e.target.value}
								onKeyDown={e => { if (e.key === 'Escape') { store.keywords = '' } } }/>
							<Icon name="filter" title="Filter Options" onMouseDown={e => e.stopPropagation()} onClick={e => showFilterPopup.set(!showFilterPopup.get())} />
						</div>
						<Icon name={allCollapsed ? 'expand-all' : 'collapse-all'}
							title={allCollapsed ? 'Expand All' : 'Collapse All'}
							onClick={() => store.groupsFilteredSorted.forEach(group => group.expanded = allCollapsed)} />
						<Icon name="folder-opened" title="Open Log" onClick={() => vscode.postMessage({ command: 'open' })} />
				</div>
				<div className={css('svListTableScroller', selected && 'svSelected')} tabIndex={0} onKeyDown={this.onKeyDown}>
					{selectedTab.get() === 'Logs'
						? <div className="svLogsPane">
							{logs.map((log, i) => {
								const {pathname} = new URL(log._uri)
								return <div key={i} className="svListItem">
									<div>{pathname.file}</div>
									<div className="ellipsis svSecondary">{pathname.path}</div>
									<Icon name="close" title="Remove Log"
										onClick={() => vscode.postMessage({ command: 'removeLog', uri: log._uri })} />
								</div>
							})}
						</div>
						: (!rows.length
							? <div className="svZeroData">
								<span>No results found with provided filter criteria.</span>
								<div onClick={() => store.clearFilters()}>Clear Filters</div>
							</div>
							: <table className="svListTable">
								<colgroup>
									<col width="30" />
									{columns.map((col, i, cols) => {
										if (i === cols.length - 1) return null
										const iconWidth = i === 0 ? 16 : 0
										return <col key={col} width={iconWidth + this.columnWidth(col).get()} />
									})}
								</colgroup>
								<thead>
									<tr>
										<td className="svSpacer"><span className="svCell">&nbsp;</span></td>{/* svCell and nbsp to get matching height */}
										{columns.map((col, i, cols) =>
											<td key={col}>
												<span className="svCell svSecondary"
													onClick={action(() => {
														store.sortColumn = col
														store.sortDir = SortDir.reverse(sortDir)
													})}>
													{col}
													{sortColumn === col && <Icon title="Sort" name={sortDir} />}
												</span>
												{i < cols.length - 1 && <ResizeHandle size={this.columnWidth(col)} horizontal />}
											</td>
										)}
									</tr>
								</thead>
								<tbody>
									{rows.map(row => {
										if (row instanceof Group) {
											const group = row
											const {key, expanded, title, itemsFiltered} = group
											return <tr key={`group${key}`}>
												<td colSpan={columns.length + 1}><span className="svCell svGroup"
													onClick={() => {
														store.selectedItem = null
														group.expanded = !expanded
													}}>
													<div className={`twisties codicon codicon-chevron-${expanded ? 'down' : 'right'}`}></div>
													{groupBy === 'File'
														? (() => {
															const {pathname} = new URL(title, 'file:')
															return <>
																<Hi>{pathname.file || 'No Location'}</Hi>
																<Hi className="ellipsis svSecondary">{pathname.path}</Hi>
															</>
														})()
														: (() => {
															const [ruleName, ruleId] = title.split('|')
															return <>
																<Hi>{ruleName}</Hi>
																<Hi className="ellipsis svSecondary">{ruleId}</Hi>
															</>
														})()}
													<Badge text={itemsFiltered.length} />
												</span></td>
											</tr>
										}
										const item = row
										const result = item.data
										const isSelected = store.selectedItem === item
										return <tr key={`item${item.key}`}
											onClick={() => store.selectedItem = item}
											className={css(isSelected && 'svItemSelected')}
											ref={td => {
												if (!isSelected || !td) return
												requestAnimationFrame(() => td.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
											}}>

											<td className="svSpacer"></td>
											{columns.map((col, i) =>
												<td key={col}><span className="svCell">
													{i === 0 && <span className={`codicon codicon-${levelToIcon[result.level]}`} />}
													{(() => {
														switch (col) {
															case 'Line':
																return <Hi>{result._line < 0 ? '—' : result._line}</Hi>
															case 'File':
																return <Hi className="ellipsis" title={result._uri ?? '—'}>{result._uri?.file ?? '—'}</Hi>
															case 'Message':
																return <Hi className="ellipsis" title={result._message}>
																	{renderMessageWithEmbeddedLinks(result, vscode.postMessage)}
																</Hi>
															case 'Rule':
																return <>
																	<Hi>{result._rule?.name ?? '—'}</Hi>
																	<Hi className="svSecondary">{result.ruleId}</Hi>
																</>
															default:
																const capitalize = str => `${str[0].toUpperCase()}${str.slice(1)}`
																const selector = store.groupings[col]
																const text = capitalize(selector(result))
																return <Hi className="ellipsis" title={text}>{text}</Hi>
														}
													})()}
												</span></td>
											)}
										</tr>
									})}
								</tbody>
							</table>
						)
					}
				</div>
			</div>
			<div className="svListPane">
				<TabPanel titles={['Locations', 'Rules', 'Logs']}
					extras={<>
						<div className="flexFill"></div>
						<div className="svFilterCombo">
							<input type="text" placeholder="Filter results" value={store.keywords}
								onChange={e => store.keywords = e.target.value}
								onKeyDown={e => { if (e.key === 'Escape') { store.keywords = '' } } }/>
							<Icon name="filter" title="Filter Options" onMouseDown={e => e.stopPropagation()} onClick={e => showFilterPopup.set(!showFilterPopup.get())} />
						</div>
						<Icon name={allCollapsed ? 'expand-all' : 'collapse-all'}
							title={allCollapsed ? 'Expand All' : 'Collapse All'}
							onClick={() => store.groupsFilteredSorted.forEach(group => group.expanded = allCollapsed)} />
						<Icon name="folder-opened" title="Open Log" onClick={() => vscode.postMessage({ command: 'open' })} />
					</>}>
					<ResultTable store={store.resultTableStoreByLocation} onClearFilters={() => store.clearFilters()}
						renderGroup={(title: string) => {
							const {pathname} = new URL(title, 'file:')
							return <>
								<span>{pathname.file || 'No Location'}</span>
								<span className="ellipsis svSecondary">{pathname.path}</span>
							</>
						}} />
					<ResultTable store={store.resultTableStoreByRule} onClearFilters={() => store.clearFilters()}
						renderGroup={(rule: ReportingDescriptor | undefined) => {
							return <>
								<span>{rule?.name ?? '—'}</span>
								<span className="ellipsis svSecondary">{rule?.id ?? '—'}</span>
							</>
						}} />
					<div className="svLogsPane">
						{logs.map((log, i) => {
							const {pathname} = new URL(log._uri)
							return <div key={i} className="svListItem">
								<div>{pathname.file}</div>
								<div className="ellipsis svSecondary">{pathname.path}</div>
								<Icon name="close" title="Remove Log"
									onClick={() => vscode.postMessage({ command: 'removeLog', uri: log._uri })} />
							</div>
						})}
					</div>
				</TabPanel>
			</div>
			<div className="svResizer">
				<ResizeHandle size={detailsPaneHeight} />
			</div>
			<Details result={selected} height={detailsPaneHeight} />
			<Popover show={showFilterPopup} style={{ top: 35, right: 8 + 35 + 35 + 8 }}>
				{Object.entries(store.filtersRow).map(([name, state]) => <Fragment key={name}>
					<div className="svPopoverTitle">{name}</div>
					{Object.keys(state).map(name => <Checkrow key={name} label={name} state={state} />)}
				</Fragment>)}
				<div className="svPopoverDivider" />
				{Object.entries(store.filtersColumn).map(([name, state]) => <Fragment key={name}>
					<div className="svPopoverTitle">{name}</div>
					{Object.keys(state).map(name => <Checkrow key={name} label={name} state={state} />)}
				</Fragment>)}
			</Popover>
		</FilterKeywordContext.Provider>
	}

	@action.bound private onKeyDown(e: React.KeyboardEvent) {
		const {store} = this.props
		if (e.key === 'ArrowUp') {
			e.preventDefault() // Prevent Scroll
			store.selectedItem = store.selectedItem?.prev ?? store.selectedItem
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault() // Prevent Scroll
			store.selectedItem = store.selectedItem?.next ?? store.selectedItem
		}
		if (e.key === 'Escape') {
			store.selectedItem = null
		}
	}

	private selectionAutoRunDisposer: IReactionDisposer

	componentDidMount() {
		addEventListener('message', this.props.store.onMessage)
		this.selectionAutoRunDisposer = autorun(() => {
			// const result = this.props.store.selectedItem?.data
			const selectedRow = this.props.store.selection2.get()
			const result = selectedRow instanceof RowItem && selectedRow.item
			if (!result?._uri) return // Bail on no result or location-less result.
			postSelectArtifact(result, result.locations?.[0]?.physicalLocation)
		})
	}

	componentWillUnmount() {
		removeEventListener('message', this.props.store.onMessage)
		this.selectionAutoRunDisposer()
	}
}
