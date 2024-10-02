import {writeFileSync } from 'node:fs';
function updateAuth(auth) {
    writeFileSync("auth_test.json", auth);
}
updateAuth(JSON.stringify({prop1: "eres", prop2: "somethingelse"}));