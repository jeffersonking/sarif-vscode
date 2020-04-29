
import { IObservableValue } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component } from 'react'
import ReactMarkdown from 'react-markdown'
import { Result } from 'sarif'
import './Index.details.scss'
import { renderMessageWithEmbeddedLinks, TabPanel } from './Index.widgets'

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
				<div className="svDetailsBody --svDetailsBodyInfo">
					<div className="svDetailsMessage">
						{result._markdown
							? <ReactMarkdown className="svMarkDown" source={result._markdown} escapeHtml={false} />
							: renderMessageWithEmbeddedLinks(result, vscode.postMessage)}</div>
					<div className="svDetailsInfo">
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
				<div className="svDetailsBody svDetailsBodyCodeflow">
					{result.codeFlows
						? result.codeFlows[0]?.threadFlows?.[0].locations
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
	}
}
