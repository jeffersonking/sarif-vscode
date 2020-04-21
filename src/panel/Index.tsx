import { observable, action, IObservableValue, autorun, IReactionDisposer } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component, PureComponent } from 'react'
import { Log } from 'sarif'

import './codicon.css'
import './Index.scss'
import { ResizeHandle } from './Index.ResizeHandle'
import { Store, SortDir, Group } from './Store'

export { Store } from './Store'
export * as React from 'react'
export * as ReactDOM from 'react-dom'

class Badge extends PureComponent<{ text: { toString: () => string } }> {
	render() {
		return <span className="svBadge">{this.props.text.toString()}</span>
	}
}

const levelToIcon = {
	error: 'error',
	warning: 'warning',
	info: 'info',
	none: 'issues',
	undefined: 'question',
}

class Icon extends PureComponent<{ name: string, onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void }> {
	render() {
		const {name: iconName, onClick} = this.props
		return <div className={`codicon codicon-${iconName}`} onClick={onClick}></div>
	}
}

@observer class TabBar extends Component<{ titles: string[], selection: IObservableValue<string> }> {
	render() {
		const {titles, selection} = this.props
		return <div className="svTabs">
			{titles.map((title, i) => <div key={i} onClick={() => selection.set(title)}>
				<div className={selection.get() === title ? 'svTabSelected' : ''}>{title}</div>
			</div>)}
		</div>
	}
}

@observer class TabPanel extends Component<{ titles: string[] }> {
	@observable private selected = 0
	render() {
		const {selected} = this
		const {children, titles} = this.props
		const array = React.Children.toArray(children)
		return <>
			<div className="svTabs">
				{titles.map((title, i) => <div key={i} onClick={() => this.selected = i}>
					<div className={selected === i ? 'svTabSelected' : ''}>{title}</div>
				</div>)}
			</div>
			{array[selected]}
		</>
	}
}

@observer export class Index extends Component<{ store: Store }> {
	private vscode = acquireVsCodeApi()

	private columnWidths = new Map<string, IObservableValue<number>>([
		['Line', observable.box(50)],
		['Message', observable.box(300)],
	])
	private columnWidth(name: string) {
		if (!this.columnWidths.has(name)) this.columnWidths.set(name, observable.box(220))
		return this.columnWidths.get(name)
	}

	private detailsPaneHeight = observable.box(250)

	@action.bound private onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		const {store} = this.props
		if (!(e.key === 'ArrowUp' || e.key === 'ArrowDown')) return
		if (e.key === 'ArrowUp') {
			store.selectedItem = store.selectedItem?.prev ?? store.selectedItem
		}
		if (e.key === 'ArrowDown') {
			store.selectedItem = store.selectedItem?.next ?? store.selectedItem
		}
	}

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
		const {detailsPaneHeight} = this
		const columns = Object.keys(groupings).filter(col => col !== groupBy)

		const listPane = <div tabIndex={0} ref={ref => ref?.focus()} className="svListPane" onKeyDown={this.onKeyDown}>
			<div className="svListHeader">
				<TabBar titles={store.tabs} selection={store.selectedTab} />
				<div className="flexFill"></div>
				<Icon name="collapse-all" onClick={() => store.groupsSorted.forEach(group => group.expanded = false)} />
				<Icon name="folder-opened" onClick={() => this.vscode.postMessage({ command: 'open' })} />
			</div>
			<div className="svListTableScroller">
				{selectedTab.get() === 'Logs'
					? <div className="svLogsPane">
						{logs.map((log, i) => {
							const {pathname} = new URL(log._uri)
							return <div key={i} className="svListItem">
								<div>{pathname.file}</div>
								<div className="ellipsis svSecondary">{pathname.path}</div>
								<Icon name="close" />
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
											{sortColumn === col && <Icon name={sortDir} />}
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
									const {key, expanded, title, items} = group
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
											<Badge text={items.length} />
										</span></td>
									</tr>
								}
								const item = row
								const result = item.data
								const isSelected = store.selectedItem === item
								return <tr key={`item${item.key}`}
									onClick={() => {
										store.selectedItem = item
										this.vscode.postMessage({ command: 'select', id: result._id })
									}}
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
														return <span className="ellipsis" title={result._message}>{result._message}</span>
													case 'Rule':
														return <>
															<span>{result._rule?.name ?? '—'}</span>
															<span className="svSecondary">{result.ruleId}</span>
														</>
													default:
														return <span>—</span>
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

		const selected = store.selectedItem?.data
		return <>
			{listPane}
			<div className="svResizer">
				<ResizeHandle size={detailsPaneHeight} />
			</div>
			<div className="svDetailsPane" style={{ height: detailsPaneHeight.get() }}>
				{selected && <TabPanel titles={['Info', 'Code Flow']}>
					<div className="svDetailsBody --svDetailsBodyInfo">
						<div className="svDetailsMessage">{selected._message}</div>
						<div className="svDetailsInfo">
							<span>Rule Id</span>			<span>{selected.ruleId}</span>
							<span>Rule Name</span>			<span>{selected._rule?.name ?? '—'}</span>
							<span>Rule Description</span>	<span>{selected._rule?.fullDescription?.text ?? selected._rule?.shortDescription?.text ?? '—'}</span>
							<span>Level</span>				<span>{selected.level}</span>
							<span>Kind</span>				<span>{selected.kind ?? '—'}</span>
							<span>Baseline State</span>		<span>{selected.baselineState ?? '—'}</span>
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
		</>
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

		const fetchLog = async ({uri, webviewUri }: {uri: string, webviewUri: string}) => {
			const response = await fetch(webviewUri)
			const log = await response.json() as Log
			log._uri = uri
			return log	
		}

		if (command === 'replaceLogs') {
			const uris = event.data.uris as { uri: string, webviewUri: string }[]
			store.logs.replace(await Promise.all(uris.map(fetchLog)))
		}

		if (command === 'addLog') {
			const {uri, webviewUri} = event.data
			if (uri && webviewUri) { // Check needed?
				store.logs.push(await fetchLog(event.data))
			}
		}
	}

	private selectionAutoRunDisposer: IReactionDisposer

	componentDidMount() {
		addEventListener('message', this.onMessage)
		this.selectionAutoRunDisposer = autorun(() => {
			const result = this.props.store.selectedItem?.data
			if (!result) return
			this.vscode.postMessage({ command: 'select', id: result._id })
		})
	}

	componentWillUnmount() {
		removeEventListener('message', this.onMessage)
		this.selectionAutoRunDisposer()
	}
}
