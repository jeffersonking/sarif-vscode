// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { autorun, computed, IObservableValue, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component } from 'react'
import ReactMarkdown from 'react-markdown'
import { Result, ThreadFlowLocation, Location, StackFrame, Stack } from 'sarif'
import { parseArtifactLocation, parseLocation } from '../shared'
import './Details.scss'
import './Index.scss'
import { postSelectArtifact, postSelectLog } from './IndexStore'
import { List, renderMessageWithEmbeddedLinks, TabPanel } from './widgets'

@observer export class Details extends Component<{ result: Result, height: IObservableValue<number> }> {
	private selectedTab = observable.box('Info')
	@computed private get threadFlowLocations() {
		return this.props.result?.codeFlows?.[0]?.threadFlows?.[0].locations
			.map(threadFlowLocation => threadFlowLocation.location)
			.filter(locations => locations)
	}
	@computed private get stackFrameLocations() {
		return this.props.result?.stacks?.map(stack => stack.frames)
			.flat()
			.map(stackFrame => stackFrame.location)
			.filter(location => location)		
	}
	@computed private get stacks() {
		return this.props.result?.stacks
	}
	constructor(props) {
		super(props)
		autorun(() => {
			const hasThreadFlows = !!this.threadFlowLocations?.length
			this.selectedTab.set(hasThreadFlows ? 'Code Flows' : 'Info')
		})
	}
	render() {
		const renderRuleDesc = (desc?: { text: string, markdown?: string }) => {
			if (!desc) return '—'
			return desc.markdown
				? <ReactMarkdown className="svMarkDown" source={desc.markdown} />
				: desc.text
		}

		const {result, height} = this.props
		const helpUri = result?._rule?.helpUri
		const renderItem = (location: Location) => {
			const { message, uri, region } = parseLocation(result, location)
			return <>
				<div className="ellipsis">{message ?? '—'}</div>
				<div className="svSecondary">{uri?.file ?? '—'}</div>
				<div className="svLineNum">{region.startLine}:1</div>
			</>
		}
		const renderStack = (stackFrame: StackFrame) => {
			const location = stackFrame?.location
			const logicalLocation = stackFrame?.location?.logicalLocations[0]
			const { message, uri, region } = parseLocation(result, location)
			const locationMessageText = message ? `${message} -` : ``
			const text = logicalLocation?.fullyQualifiedName ? `${locationMessageText} ${logicalLocation.fullyQualifiedName}` : `${locationMessageText}`
			return <>
				<div className="ellipsis">{text ?? '—'}</div>
				<div className="svSecondary">{uri?.file ?? '—'}</div>
				<div className="svLineNum">{region.startLine}:1</div>
			</>
		}
		return <div className="svDetailsPane" style={{ height: height.get() }}>
			{result && <TabPanel tabs={['Info', 'Code Flows', 'Stacks']} selection={this.selectedTab}>
				<div className="svDetailsBody svDetailsInfo">
					<div className="svDetailsMessage">
						{result._markdown
							? <ReactMarkdown className="svMarkDown" source={result._markdown} escapeHtml={false} />
							: renderMessageWithEmbeddedLinks(result, vscode.postMessage)}</div>
					<div className="svDetailsGrid">
						<span>Rule Id</span>			{helpUri ? <a href={helpUri} target="_blank">{result.ruleId}</a> : <span>{result.ruleId}</span>}
						<span>Rule Name</span>			<span>{result._rule?.name ?? '—'}</span>
						<span>Rule Desc Short</span>	<span>{renderRuleDesc(result._rule?.shortDescription)}</span>
						<span>Rule Desc Full</span>		<span>{renderRuleDesc(result._rule?.fullDescription)}</span>
						<span>Level</span>				<span>{result.level}</span>
						<span>Kind</span>				<span>{result.kind ?? '—'}</span>
						<span>Baseline State</span>		<span>{result.baselineState}</span>
						<span>Locations</span>			<span>
															{result.locations?.map((loc, i) => {
																const ploc = loc.physicalLocation
																const [uri, _] = parseArtifactLocation(result, ploc?.artifactLocation)
																return <a key={i} href="#" className="ellipsis" title={uri}
																	onClick={e => {
																		e.preventDefault() // Cancel # nav.
																		postSelectArtifact(result, ploc)
																	}}>
																	{uri?.file ?? '-'}
																</a>
															}) ?? <span>—</span>}
														</span>
						<span>Log</span>				<a href="#" title={result._log._uri}
															onClick={e => {
																e.preventDefault() // Cancel # nav.
																postSelectLog(result)
															}}>
															{result._log._uri.file}{result._log._uriUpgraded && ' (upgraded)'}
														</a>
						{/* <span>Properties</span>		<span><pre><code>{JSON.stringify(selected.properties, null, '  ')}</code></pre></span> */}
					</div>
				</div>
				<div className="svDetailsBody svDetailsCodeflowAndStacks">
					{(() => {
						const items = this.threadFlowLocations
						
						const selection = observable.box(undefined as Location, { deep: false })
						selection.observe(change => {
							const location = change.newValue
							postSelectArtifact(result, location?.physicalLocation)
						})

						return <List items={items} renderItem={renderItem} selection={selection} allowClear>
							<span className="svSecondary">No code flows in selected result.</span>
						</List>
					})()}
				</div>
				<div className="svDetailsBody">
					{(() => {
						if (!this.stacks || !this.stacks.length) 
							return <div className="svNoStacksContainer">
								<span className="svSecondary">No stacks in selected result.</span>
							</div>

						return this.stacks.map(stack => {
							const stackFrames = stack?.frames

							const selection = observable.box(undefined as Location, { deep: false })
							selection.observe(change => {
								const location = change.newValue
								postSelectArtifact(result, location?.physicalLocation)
							})
							return <div className="svStackContainer">
								<div className="svStacksMessage">
									{stack?.message?.text}
								</div>
								<div className="svDetailsBody svDetailsCodeflowAndStacks">
									<List items={stackFrames} renderItem={renderStack} selection={selection} allowClear />
								</div>
							</div>
						})
					})()}
				</div>
			</TabPanel>}
		</div>
	}
}
