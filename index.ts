import { TimeMapLoader, DownloadedURLListLoader, FailedURLListLoader, URLListLoader, BulkDownloader, DownloaderWrapper } from "./index.modules.ts";
import rl from 'node:readline';
import { URL } from "node:url";

async function main() {
    const io = rl.createInterface(process.stdin, process.stdout);
    io.setPrompt('Enter URL to crawl (!e to exit): ');

    while (true) {
        let query: string = await new Promise(resolve => {
            io.addListener('line', (input: string) => {
                io.removeAllListeners();
                resolve(input);
            });
            io.prompt(true);
        });

        if (!query) continue;
        if (query == 'exit') process.exit(0);
        if (query == 'clear') console.clear();

        let target_url = URL.parse(query);
        if (!target_url) continue;

        await DownloaderWrapper(target_url.href);
        // add more rules here
    }
}

main();

// let p_in = path.join(DIR, 'out');
// let p_out = path.join(DIR, 'out2');
// let urls = fs.readdirSync(p_in);
// for (let encoded_url of urls) {
//     let path_in = path.join(p_in, encoded_url);
//     let data = fs.readFileSync(path_in);
//     let decoded_url = decodeURIComponent(encoded_url).replace(/https?:\/\/tankionline.com\/tutorial\//, '');
//     let path_out = path.join(p_out, decoded_url);
//     if (!fs.existsSync(path_out)) fs.mkdirSync(path.dirname(path_out), { recursive: true });
//     fs.writeFileSync(path_out, data);
// }