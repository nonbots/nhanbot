// Parsing the IRC parameters component if it contains a command (e.g., !dice).

export function parseParameters(rawParametersComponent, command) {
    let idx = 0
    let commandParts = rawParametersComponent.slice(idx + 1).trim(); 
    let paramsIdx = commandParts.indexOf(' ');

    if (-1 == paramsIdx) { // no parameters
        command.botCommand = commandParts.slice(0); 
    }
    else {
        command.botCommand = commandParts.slice(0, paramsIdx); 
        command.botCommandParams = commandParts.slice(paramsIdx).trim();
        // TODO: remove extra spaces in parameters string
    }

    return command;
}