
import { IObservableValue, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component } from 'react'
import ReactMarkdown from 'react-markdown'
import { Result } from 'sarif'
import { parseRegion } from '../shared'
import './Index.details.scss'
import { List, renderMessageWithEmbeddedLinks, TabPanel } from './Index.widgets'

@observer export class Details extends Component<{ result: Result, height: IObservableValue<number> }> {
	render() {
		const renderRuleDesc = (desc?: { text: string, markdown?: string }) => {
			if (!desc) return '—'
			return desc.markdown
				? <ReactMarkdown className="svMarkDown" source={desc.markdown} />
				: desc.text
		}

		const {result, height: detailsPaneHeight} = this.props
		return <div className="svDetailsPane" style={{ height: detailsPaneHeight.get() }}>
			{result && <TabPanel titles={['Info', 'Code Flows']}>
				<div className="svDetailsBody svDetailsInfo">
					<div className="svDetailsMessage">
						{result._markdown
							? <ReactMarkdown className="svMarkDown" source={result._markdown} escapeHtml={false} />
							: renderMessageWithEmbeddedLinks(result, vscode.postMessage)}</div>
					<div className="svDetailsGrid">
						<span>Rule Id</span>			<span>{result.ruleId}</span>
						<span>Rule Name</span>			<span>{result._rule?.name ?? '—'}</span>
						<span>Rule Desc Short</span>	<span>{renderRuleDesc(result._rule?.shortDescription)}</span>
						<span>Rule Desc Full</span>		<span>{renderRuleDesc(result._rule?.fullDescription)}</span>
						<span>Level</span>				<span>{result.level}</span>
						<span>Kind</span>				<span>{result.kind ?? '—'}</span>
						<span>Baseline State</span>		<span>{result.baselineState}</span>
						<span>Locations</span>			<span>
															{result.locations?.map((loc, i) => {
																const uri = loc.physicalLocation?.artifactLocation?.uri.file
																return <span key={i} className="ellipsis">{uri}</span>
															}) ?? <span>—</span>}
														</span>
						<span>Log</span>				<a href="#" title={result._log._uri}
															onClick={e => {
																e.preventDefault() // Cancel # nav.
																vscode.postMessage({ command: 'select', id: result._id, gotoLog: true })}
															}>
															{result._log._uri.file}
														</a>
						{/* <span>Properties</span>		<span><pre><code>{JSON.stringify(selected.properties, null, '  ')}</code></pre></span> */}
					</div>
				</div>
				<div className="svDetailsBody svDetailsCodeflow">
					{(() => {
						const parseTFLoc = (tfLocation) => {
							const {message, physicalLocation} = tfLocation.location
							const alocResult = physicalLocation?.artifactLocation
							const alocRun = result._run.artifacts?.[alocResult.index ?? -1]?.location
							const uri = alocRun?.uri ?? alocResult.uri
							return [message, uri, physicalLocation?.region]
						}

						const items = result.codeFlows?.[0]?.threadFlows?.[0].locations
							.filter(tfLocation => tfLocation.location)

						const selection = observable.box(0)
						selection.observe(change => {
							const [_, uri, region] = parseTFLoc(items[change.newValue])
							const logUri = result._log._uri
							vscode.postMessage({ command: 'select2', logUri, uri, region: parseRegion(region) })
						})

						const renderItem = (tfLocation, i) => { // ThreadflowLocation
							const [message, uri, region] = parseTFLoc(tfLocation)
							const fileName = uri?.file ?? '—'
							return <>
								<div className="ellipsis">{message?.text ?? '—'}</div>
								<div className="svSecondary">{fileName}</div>
								<div className="svLineNum">{region.startLine}:1</div>
							</>
						}

						return <List items={items} renderItem={renderItem} selection={selection}>
							<span className="svSecondary">No code flows in selected result.</span>
						</List>
					})()}
				</div>
			</TabPanel>}
		</div>
	}
}
