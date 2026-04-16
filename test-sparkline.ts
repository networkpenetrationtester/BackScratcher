import { RetryFailedRequest } from "./index.modules.ts";
import fs from 'node:fs'

let x = await RetryFailedRequest('https://tankionline.com/tutorial/src/resources/movies/finish.swf');
x && fs.writeFileSync('./test.swf', x);
!x && console.log('no luck i guess');