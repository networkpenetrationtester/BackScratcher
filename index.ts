import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const TARGET_URL = 'tankionline.com/tutorial';

interface $URLListObject {
    version: number, // can repurpose to querystring
    wayback_url: string,
    downloaded?: boolean
}

interface $WaybackTimeMapObject {
    [Symbol.iterator](): {
        next: () => { value: any }
    }
    original: string
    mimetype: string
    timestamp: number
    endtimestamp: number
    groupcount: number
    uniqcount: number
}

interface $WaybackSparkLineObject {
    years: { [key: string]: Array<Number> }
    first_ts: string,
    last_ts: string,
    status: { [key: string]: string }
}

interface $ResponseHandlerArgs {
    options?: RequestInit
    handler?: (res: Response) => any
}

const default_options: RequestInit = {
    headers: {
        'accept': '*/*',
        'cache-control': 'no-cache',
        'pragma': 'no-cache'
    },
    referrer: 'https://web.archive.org/', // lies :3
    method: 'GET'
}

const default_handler = async (res: Response) => { let r = await res.text(); try { let r_test = JSON.parse(r); return r_test; } catch { return r; } };

async function TimeMapLoader(): Promise<$WaybackTimeMapObject[]> {
    let timemap_path = path.join(DIR, 'timemap.json');
    let timemap_exists = fs.existsSync(timemap_path);
    let timemap = timemap_exists
        ?
        JSON.parse(fs.readFileSync(timemap_path, { encoding: 'utf-8' }))
        :
        await GetWaybackTimemap(TARGET_URL, 'json')
        ;
    !timemap_exists && fs.writeFileSync(timemap_path, JSON.stringify(timemap), { encoding: 'utf-8' });
    return timemap;
};

async function URLListLoader(timemap: $WaybackTimeMapObject[]): Promise<$URLListObject[]> {
    let urllist_path = path.join(DIR, 'urllist.json');
    let urllist_exists = fs.existsSync(urllist_path);
    let urllist = urllist_exists
        ?
        JSON.parse(fs.readFileSync(urllist_path, { encoding: 'utf-8' }))
        :
        (() => {
            let latest_resources = new Map<String, { v: number, wb: string, downloaded?: boolean }>();
            for (let t of timemap) {
                let wb = `https://web.archive.org/web/${t.timestamp}/${t.original}`;
                let parts = t.original.split('?v=');
                let [url, v] = [parts[0], parseInt(parts[1])];
                if (isNaN(v)) {
                    latest_resources.set(url, {
                        v: 0,
                        wb: wb
                    });
                    continue;
                } else if (v > (latest_resources.get(url)?.v ?? -1)) {
                    latest_resources.set(url, {
                        v: v,
                        wb: wb
                    });
                }
            }
            return Array.from(latest_resources.values()).map(value => {
                // value.downloaded = false;
                return value;
            });
        })();
    !urllist_exists && fs.writeFileSync(urllist_path, JSON.stringify(urllist), { encoding: 'utf-8' });
    return urllist;
};

async function DownloadedURLListLoader() {
    let downloaded_path = path.join(DIR, 'downloaded_urllist.txt');
    let downloaded_exists = fs.existsSync(downloaded_path);
    let downloaded = downloaded_exists
        ?
        fs.readFileSync(downloaded_path, { encoding: 'utf-8' }).split('\n')
        :
        new Array<String>()
        ;
    !downloaded_exists && fs.writeFileSync(downloaded_path, '', { encoding: 'utf-8' });
    return downloaded;

}

async function FailedURLListLoader() {
    let errors_path = path.join(DIR, 'failed_urllist.txt');
    let errors_exists = fs.existsSync(errors_path);
    let errors = errors_exists
        ?
        fs.readFileSync(errors_path, { encoding: 'utf-8' }).split('\n')
        :
        new Array<String>()
        ;
    !errors_exists && fs.writeFileSync(errors_path, '', { encoding: 'utf-8' });
    return errors;
}

async function FetchWrapper(url: string, args: $ResponseHandlerArgs): Promise<any> {
    let res = await fetch(url, args.options ?? {});
    if (res.status !== 200) throw new Error(`${res.status}#${res.statusText}#${res.url}`);
    return args.handler ? await args.handler(res) : res;
}

async function Delay(ms: number) {
    console.log(`Waiting ${ms}ms...`);
    return await new Promise((resolve) => { setTimeout(resolve, ms) });
}

async function GetWaybackHost(url: string) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/search/host?q=${url}`, {
        options: default_options,
        handler: default_handler
    });
    return data;
}

async function GetWaybackSparkline(url: string, output = 'json', collection = 'web') {
    let data = await FetchWrapper(`https://web.archive.org/__wb/sparkline?output=${output}&url=${url}&collection=${collection}`, {
        options: default_options,
        handler: default_handler
    });
    return data;
}

async function GetWaybackCalendarCapture(url: string, date: string, group_by = 'day',) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/calendarcaptures/2?url=${url}&date=${date}&groupby=${group_by}`, {
        options: default_options,
        handler: default_handler
    });
    return data;
}

async function GetWaybackTimemap
    (
        url: string,
        output = 'json',
        match_type = 'prefix',
        collapse = 'urlkey',
        filter_list = 'original,mimetype,timestamp,endtimestamp,groupcount,uniqcount',
        filter_string = '!statuscode:[45]..',
        limit = 10000
    ): Promise<$WaybackTimeMapObject[]> {
    let data = await FetchWrapper(`https://web.archive.org/web/timemap/json?url=${url}&matchType=${match_type}&collapse=${collapse}&output=${output}&fl=${filter_list}&filter=${filter_string}&limit=${limit}&_=${Date.now()}`, {
        options: default_options,
        handler: async (res) => {
            let supra: $WaybackTimeMapObject[] = await default_handler(res);
            if (supra instanceof Array) {
                supra = supra.slice(1);
                return supra.map(sup => {
                    let [
                        original,
                        mimetype,
                        timestamp,
                        endtimestamp,
                        groupcount,
                        uniqcount
                    ] = sup;
                    return {
                        original: original,
                        mimetype: mimetype,
                        timestamp: timestamp,
                        endtimestamp: endtimestamp,
                        groupcount: groupcount,
                        uniqcount: uniqcount
                    };
                });
            }
            else return supra;
        }
    })
    return data;
}

async function BulkDownloader(urllist: $URLListObject[], downloaded_urllist: String[], failed_urllist: String[], interval = 1000) {
    for (let item of urllist) {
        let url = item.wayback_url;
        if (downloaded_urllist.includes(url) || failed_urllist.includes(url)) {
            console.log(`Skipping ${url}`);
            continue;
        }
        console.log(`Fetching ${url}`);
        try {
            let res = await FetchWrapper(url, {
                handler: async (res) => Buffer.from(await res.arrayBuffer())
            });
            if (res instanceof Buffer) {
                let r = url.match(/(?!(https:\/\/web.archive.org))(?<collection>\/web\/[0-9]{14}\/)(?<resource>.*)/);
                let groups = r?.groups;
                if (groups) {
                    let resource = groups.resource.split('?')[0];
                    let resource_output_path = path.join(DIR, 'web', resource.split(TARGET_URL)[1]);
                    console.log(`Writing ${resource_output_path}`);
                    fs.writeFileSync(resource_output_path, res);
                    fs.appendFileSync(path.join(DIR, 'downloaded_urllist.txt'), downloaded_urllist.length > 0 ? '\n' + url : url);
                }
            }
        } catch (e) {
            fs.appendFileSync(path.join(DIR, 'failed_urllist.txt'), failed_urllist.length > 0 ? '\n' + url : url);
        }
        await Delay(interval);
    }
}

async function main() {
    let timemap = await TimeMapLoader();
    let downloaded_urllist = await DownloadedURLListLoader();
    let failed_urllist = await FailedURLListLoader();
    let urllist = await URLListLoader(timemap);

    await BulkDownloader(urllist, downloaded_urllist, failed_urllist, 1000);
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