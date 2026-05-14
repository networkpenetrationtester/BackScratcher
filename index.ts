import rl from 'node:readline';
import { URL } from "node:url";
import { WaybackDatabaseInterface } from "./index.database.ts";
import { BulkDownloader } from './index.modules.ts';

async function main() {
    const io = rl.createInterface(process.stdin, process.stdout);
    io.setPrompt('Enter URL to crawl (!e to exit): ');
    let wb_db_int = new WaybackDatabaseInterface();

    while (true) {
        let query: string = await new Promise(resolve => {
            io.addListener('line', (input: string) => {
                io.removeAllListeners();
                resolve(input);
            });
            io.prompt(true);
        });

        if (!query) continue;
        if (query == '/exit') process.exit(0);
        if (query == '/clear') console.clear();
        if (query == '/close') wb_db_int.Disconnect();
        // add more rules here

        let target_url = URL.parse(query);

        if (!target_url) continue;

        wb_db_int.Connect({
            url: target_url
        });

        await BulkDownloader(wb_db_int);
    }
}

main();