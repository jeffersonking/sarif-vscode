## Not Yet Implemented

The following features of [sarif-vscode-extension](https://github.com/microsoft/sarif-vscode-extension) have yet to be implemented in this project.
* Jumping/mapping from the Results List to Log document regions.
* Transform from other formats to SARIF (via the Multitool).
* A fully fleshed-out details pane (Stacks tab, etc).
* Results List does not have configurable columns or filters.

## File Structure

```
/out                    Aka 'dist' or 'bin'. Contents here become the VSIX.
    content.js          Bundled output of context + shared.
    panel.js            Bundled output of panel + shared.
/samples                Excluded from the repro (due to privacy), but required for index.html.
/src
    /context            The "extension" logic. Node-based.
        index.ts        Project entry point.
        Panel.ts        Launches content from /panel
    /panel              The Webview. Browser-based.
        codicon.*       Imported icons, do not edit.
    /shared
        extension.ts    Extension on built-in types.
        index.ts        Common logic for both context and panel.
    index.html          For Webpack Dev Server.
```

## Installation
```
npm install
npm install --force @microsoft/sarif-multitool-darwin @microsoft/sarif-multitool-win32
```
The Multitool in installed with force to override the normal platform/OS guards.

On MacOS, run `chmod u+x Sarif.Multitool` on the Multitool binary to enable execution. Will look at automating this in the future.

## Development

Run `npm start` to start watching and building the project. Then:
* `Start Debugging` or `Run Without Debugging` to run via the VS Code Extension Host.
* Open `http://localhost:8000/` to run the `Panel` portion by itself. This will live refresh.
  * Requires files from the `/samples` which you will need to provide yourself.

Run `npm test` to start watchiing and running the unit tests. These tests do not launch VS Code. Integration testing TBD.

Note: Run `npx webpack` to build once (and not watch).
