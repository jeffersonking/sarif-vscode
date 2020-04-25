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
* If `npm start` is not working, the backup is to run `npx webpack` to build manually.

Run `npm test` to start watchiing and running the unit tests. These tests do not launch VS Code. Integration testing TBD.

## Usage

Once you have started running this extension in Visual Studio Code, there are a few ways to open/load SARIF Logs.
* Any SARIF files found in a `.sarif` folder at your workspace (project) root will automatically be loaded.
* Any SARIF files found in the workspace (an not in `.sarif`) will be prompted for load.
* Any SARIF files opened for editing will automatically be loaded.
  * And likewise unloaded on document close.
* Open the SARIF Results Pane manually via command `sarif.showResultsPanel`.
  * If empty, there will be a `Open SARIF File` button.
  * If non-empty, you can use the Folder Icon on the top right to open.
  * As a refresher, commands can be executed via `Ctrl+Shift+P` or `Cmd+Shift+P`.

## Not Yet Implemented

The following features of [sarif-vscode-extension](https://github.com/microsoft/sarif-vscode-extension) have yet to be implemented in this project.
* Jumping/mapping from the Results List to Log document regions.
* Transform from other formats to SARIF (via the Multitool).
* A fully fleshed-out details pane (Stacks tab, etc).
