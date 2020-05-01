## Development

`F5` to launch this extension. Subsequent changes are watched and rebuilt. Use command `workbench.action.reloadWindow` to see the changes.

Other common tasks:
| Command | Comments |
| --- | --- |
| `npm run server` | Run the `Panel` standalone at `http://localhost:8000`. Auto-refreshes. |
| `npm test` | Run and watch unit tests.
| `npx webpack` | Build manually. |
| `npx vsce package` | Produce a VSIX. |

\* Note `Panel` standalone mode requires files from the `/samples` which you will need to provide yourself.


## Usage

Once you have started running this extension in Visual Studio Code, there are a few ways to open/load SARIF Logs.
* Any SARIF files found in a `.sarif` folder at your workspace (project) root will automatically be loaded.
* Any SARIF files found in the workspace (an not in `.sarif`) will be prompted for load.
* Any SARIF files opened for editing will automatically be loaded.
  * And likewise unloaded on document close.
* Open the SARIF Results Pane manually via command `sarif.showPanel`.
  * If empty, there will be a `Open SARIF File` button.
  * If non-empty, you can use the Folder Icon on the top right to open.
  * As a refresher, commands can be executed via `Ctrl+Shift+P` or `Cmd+Shift+P`.

SARIF Logs reference Artifacts (aka source files). Paths for these Artifacts commonly require reconciliation between the production machine/environment and your local one. You may be prompted to `Locate...` the file in these cases. To help out, the extension will:
* Attempt to automatically match files present in your workspace.
* Attempt to automatically match documents currently open if no workspace (folder) is open.
* Extrapolate paths from file you have already located.


## Not Yet Implemented

The following features of [sarif-vscode-extension](https://github.com/microsoft/sarif-vscode-extension) have yet to be implemented in this project.
* Transform from other formats to SARIF (via the Multitool).
* A fully fleshed-out details pane (Stacks tab, etc).


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
