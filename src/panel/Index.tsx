import { action, autorun, IObservableValue, IReactionDisposer, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component } from 'react'
import { Log } from 'sarif'
import '../shared/extension'
import './codicon.css'
import './Index.scss'
import { Badge, Checkrow, Icon, ResizeHandle, TabBar, TabPanel, Popover, renderMessageWithEmbeddedLinks } from './Index.widgets'
import { column, Group, SortDir, Store } from './Store'

export * as React from 'react'
export * as ReactDOM from 'react-dom'
export { Store } from './Store'

const levelToIcon = {
	error: 'error',
	warning: 'warning',
	info: 'info',
	none: 'issues',
	undefined: 'question',
}

@observer export class Index extends Component<{ store: Store }> {
	private vscode = acquireVsCodeApi()
	private showFilterPopup = observable.box(false)
	private detailsPaneHeight = observable.box(250)

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
	public columnVisibility = new Map<column, IObservableValue<boolean>>([
		['Baseline', observable.box(false)],
		['Suppression', observable.box(false)],
		['Rule', observable.box(false)],
	])

	render() {
		const {store} = this.props
		if (!store.results.length) {
			return <div className="svZeroData">
				<div onClick={() => this.vscode.postMessage({ command: 'open' })}>
					Open SARIF file
				</div>
			</div>
		}

		const {logs, selectedTab, groupBy, groupings, rows, sortColumn, sortDir} = store
		const {showFilterPopup, detailsPaneHeight, columnVisibility} = this
		const columns = ['File', 'Line', 'Message'].filter(col => col !== groupBy) as column[]
		for (const [column, visibility] of columnVisibility) {
			if (visibility.get()) columns.push(column)
		}
		const selected = store.selectedItem?.data
		return <>
			<div tabIndex={0} ref={ref => ref?.focus()} className="svListPane">
				<div className="svListHeader">
					<TabBar titles={store.tabs} selection={store.selectedTab} />
					<div className="flexFill"></div>
					<Icon name="filter" title="Filter Options" onMouseDown={e => e.stopPropagation()} onClick={e => showFilterPopup.set(!showFilterPopup.get())} />
					<Icon name="collapse-all" title="Collapse All" onClick={() => store.groupsFilteredSorted.forEach(group => group.expanded = false)} />
					<Icon name="folder-opened" title="Open Log" onClick={() => this.vscode.postMessage({ command: 'open' })} />
				</div>
				<div className="svListTableScroller">
					{selectedTab.get() === 'Logs'
						? <div className="svLogsPane">
							{logs.map((log, i) => {
								const {pathname} = new URL(log._uri)
								return <div key={i} className="svListItem">
									<div>{pathname.file}</div>
									<div className="ellipsis svSecondary">{pathname.path}</div>
									<Icon name="close" title="Remove Log"
										onClick={() => this.vscode.postMessage({ command: 'removeLog', uri: log._uri })} />
								</div>
							})}
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
															<div>{pathname.file || 'No Location'}</div>
															<div className="ellipsis svSecondary">{pathname.path}</div>
														</>
													})()
													: (() => {
														const [ruleName, ruleId] = title.split('|')
														return <>
															<div>{ruleName}</div>
															<div className="ellipsis svSecondary">{ruleId}</div>
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
										className={isSelected ? 'svItemSelected' : undefined}
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
															return <span>{result._line < 0 ? '—' : result._line}</span>
														case 'File':
															return <span className="ellipsis" title={result._uri ?? '—'}>{result._uri?.file ?? '—'}</span>
														case 'Message':
															return <span className="ellipsis" title={result._message}>
																{renderMessageWithEmbeddedLinks(result, this.vscode.postMessage)}
															</span>
														case 'Rule':
															return <>
																<span>{result._rule?.name ?? '—'}</span>
																<span className="svSecondary">{result.ruleId}</span>
															</>
														default:
															const capitalize = str => `${str[0].toUpperCase()}${str.slice(1)}`
															const selector = store.groupings[col]
															const text = capitalize(selector(result))
															return <span className="ellipsis" title={text}>{text}</span>
													}
												})()}
											</span></td>
										)}
									</tr>
								})}
							</tbody>	
						</table>}
				</div>
			</div>
			<div className="svResizer">
				<ResizeHandle size={detailsPaneHeight} />
			</div>
			<div className="svDetailsPane" style={{ height: detailsPaneHeight.get() }}>
				{selected && <TabPanel titles={['Info', 'Call Trees']}>
					<div className="svDetailsBody --svDetailsBodyInfo">
						<div className="svDetailsMessage">{renderMessageWithEmbeddedLinks(selected, this.vscode.postMessage)}</div>
						<div className="svDetailsInfo">
							<span>Rule Id</span>			<span>{selected.ruleId}</span>
							<span>Rule Name</span>			<span>{selected._rule?.name ?? '—'}</span>
							<span>Rule Description</span>	<span>{selected._rule?.fullDescription?.text ?? selected._rule?.shortDescription?.text ?? '—'}</span>
							<span>Level</span>				<span>{selected.level}</span>
							<span>Kind</span>				<span>{selected.kind ?? '—'}</span>
							<span>Baseline State</span>		<span>{selected.baselineState}</span>
						</div>
					</div>
					<div className="svDetailsBody svDetailsBodyCodeflow">
						{selected.codeFlows
							? selected.codeFlows[0]?.threadFlows?.[0].locations
								.filter(tfLocation => tfLocation.location)
								.map((tfLocation, i) => {
									const {message, physicalLocation} = tfLocation.location
									const fileName = physicalLocation?.artifactLocation?.uri?.split('/').pop() ?? '—'
									return <div key={i} className="svListItem">
										<div className="ellipsis">{message?.text ?? '—'}</div>
										<div className="svSecondary">{fileName} [{physicalLocation.region.startLine}]</div>
									</div>
								})
							: <span className="svSecondary">None</span>
						}
					</div>
				</TabPanel>}
			</div>
			<Popover show={showFilterPopup} style={{ top: 35, right: 35 * 2 }}>
				<div className="svPopoverTitle">Level</div>
				{[...store.level.entries()].map(([label, ob]) => <Checkrow key={label} label={label} checked={ob} />)}
				<div className="svPopoverTitle">Baseline</div>
				{[...store.baseline.entries()].map(([label, ob]) => <Checkrow key={label} label={label} checked={ob} />)}
				<div className="svPopoverTitle">Suppression</div>
				{[...store.suppression.entries()].map(([label, ob]) => <Checkrow key={label} label={label} checked={ob} />)}
				<div className="svPopoverDivider" />
				<div className="svPopoverTitle">Columns</div>
				{[...this.columnVisibility.entries()].map(([label, ob]) => <Checkrow key={label} label={label} checked={ob} />)}
			</Popover>
		</>
	}

	@action.bound private onKeyDown(e: KeyboardEvent) {
		const {store} = this.props
		if (e.key === 'ArrowUp') {
			store.selectedItem = store.selectedItem?.prev ?? store.selectedItem
		}
		if (e.key === 'ArrowDown') {
			store.selectedItem = store.selectedItem?.next ?? store.selectedItem
		}
		if (e.key === 'Escape') {
			store.selectedItem = null
		}
	}

	@action.bound private async onMessage(event: MessageEvent) {
		// if (event.origin === 'http://localhost:8000') return
		if (!event.data) return // Ignore mysterious empty message
		if (event.data?.source) return // Ignore 'react-devtools-*'
		if (event.data?.type) return // Ignore 'webpackOk'
		
		const {store} = this.props
		const command = event.data?.command

		if (command === 'select') {
			const {id} = event.data // id undefined means deselect.
			if (!id) {
				store.selectedItem = null
			} else {
				const [logUri, runIndex, resultIndex] = id
				const result = store.logs.find(log => log._uri === logUri)?.runs[runIndex]?.results?.[resultIndex]
				if (!result) throw new Error('Unexpected: result undefined')
				store.selectedItem = store.items.find(item => item.data === result) ?? null
				if (store.selectedItem?.group)
					store.selectedItem.group.expanded = true
			}
		}

		if (command === 'spliceLogs') {
			for (const uri of event.data.removed) {
				const i = store.logs.findIndex(log => log._uri === uri)
				if (i >= 0) store.logs.splice(i, 1)	
			}
			for (const {uri, webviewUri} of event.data.added) {
				const response = await fetch(webviewUri)
				const log = await response.json() as Log
				log._uri = uri
				store.logs.push(log)
			}
		}
	}

	private selectionAutoRunDisposer: IReactionDisposer

	componentDidMount() {
		addEventListener('keydown', this.onKeyDown)
		addEventListener('message', this.onMessage)
		this.selectionAutoRunDisposer = autorun(() => {
			const result = this.props.store.selectedItem?.data
			if (!result) return
			this.vscode.postMessage({ command: 'select', id: result._id })
		})
	}

	componentWillUnmount() {
		removeEventListener('keydown', this.onKeyDown)
		removeEventListener('message', this.onMessage)
		this.selectionAutoRunDisposer()
	}
}
