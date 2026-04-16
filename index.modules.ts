import fs from 'node:fs'
import path from 'path';
import type { $WaybackTimeMapObject, $URLListObject, $ResponseHandlerArgs } from './index.types.ts';

export const DIR = () => import.meta.dirname;

export const wayback_regex = /(?!(https:\/\/web.archive.org))(?<collection>\/web\/[0-9]{14}\/)(?<resource>.*)/;

export const wayback_fetch_options: RequestInit = {
    headers: {
        'accept': '*/*',
        'cache-control': 'no-cache',
        'pragma': 'no-cache'
    },
    referrer: 'https://web.archive.org/', // lies :3
    method: 'GET'
}

export const wayback_fetch_handler = async (res: Response) => { let r = await res.text(); try { let r_test = JSON.parse(r); return r_test; } catch { return r; } };

export async function TimeMapLoader(target_url: string): Promise<$WaybackTimeMapObject[]> {
    let timemap_path = path.join(DIR(), 'records', encodeURIComponent(target_url), 'timemap.json');
    let timemap_exists = fs.existsSync(timemap_path);
    let timemap = timemap_exists
        ?
        JSON.parse(fs.readFileSync(timemap_path, { encoding: 'utf-8' }))
        :
        await GetWaybackTimemap(target_url, 'json')
        ;
    !timemap_exists && fs.mkdirSync(path.dirname(timemap_path), { recursive: true });
    !timemap_exists && fs.writeFileSync(timemap_path, JSON.stringify(timemap), { encoding: 'utf-8' });
    return timemap;
};

export async function URLListLoader(target_url: string, timemap: $WaybackTimeMapObject[]): Promise<$URLListObject[]> {
    let urllist_path = path.join(DIR(), 'records', encodeURIComponent(target_url), 'urllist.json');
    let urllist_exists = fs.existsSync(urllist_path);
    let urllist = urllist_exists
        ?
        JSON.parse(fs.readFileSync(urllist_path, { encoding: 'utf-8' }))
        :
        (() => { // maybe make this user-specified?
            let latest_resources = new Map<String, { version: number, wayback_url: string, downloaded?: boolean }>();
            for (let t of timemap) {
                // possible implementation of URL.parse?
                let wayback_url = `https://web.archive.org/web/${t.timestamp}/${t.original}`;
                let parts = t.original.split('?v=');
                let [url, version] = [parts[0], parseInt(parts[1])];
                if (isNaN(version)) {
                    latest_resources.set(url, {
                        version: 0,
                        wayback_url: wayback_url
                    });
                    continue;
                } else if (version > (latest_resources.get(url)?.version ?? -1)) {
                    latest_resources.set(url, {
                        version: version,
                        wayback_url: wayback_url
                    });
                }
            }
            return Array.from(latest_resources.values());
            //.map(value => {
            // value.downloaded = false;
            // return value;
            // });
        })();
    !urllist_exists && fs.mkdirSync(path.dirname(urllist_path), { recursive: true });
    !urllist_exists && fs.writeFileSync(urllist_path, JSON.stringify(urllist), { encoding: 'utf-8' });
    return urllist;
};

export async function DownloadedURLListLoader(target_url: string) {
    let downloaded_path = path.join(DIR(), 'records', encodeURIComponent(target_url), 'downloaded_urllist.txt');
    let downloaded_exists = fs.existsSync(downloaded_path);
    let downloaded = downloaded_exists
        ?
        fs.readFileSync(downloaded_path, { encoding: 'utf-8' }).split('\n')
        :
        new Array<String>()
        ;
    !downloaded_exists && fs.mkdirSync(path.dirname(downloaded_path), { recursive: true });
    !downloaded_exists && fs.writeFileSync(downloaded_path, '', { encoding: 'utf-8' });
    return downloaded;

}

export async function FailedURLListLoader(target_url: string) {
    let errors_path = path.join(DIR(), 'records', encodeURIComponent(target_url), 'failed_urllist.txt');
    let errors_exists = fs.existsSync(errors_path);
    let errors = errors_exists
        ?
        fs.readFileSync(errors_path, { encoding: 'utf-8' }).split('\n')
        :
        new Array<String>()
        ;
    !errors_exists && fs.mkdirSync(path.dirname(errors_path), { recursive: true });
    !errors_exists && fs.writeFileSync(errors_path, '', { encoding: 'utf-8' });
    return errors;
}

export async function FetchWrapper(url: string, args: $ResponseHandlerArgs): Promise<any> {
    let res = await fetch(url, args.options ?? {});
    if (res.status !== 200) throw new Error(`${res.status}#${res.statusText}#${res.url}`);
    return args.handler ? await args.handler(res) : res;
}

export async function Delay(ms: number) {
    console.log(`Waiting ${ms}ms...`);
    return await new Promise((resolve) => { setTimeout(resolve, ms) });
}

export async function GetWaybackHost(url: string) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/search/host?q=${url}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export async function GetWaybackSparkline(url: string, output = 'json', collection = 'web') {
    let data = await FetchWrapper(`https://web.archive.org/__wb/sparkline?output=${output}&url=${url}&collection=${collection}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export async function GetWaybackCalendarCapture(url: string, date: string, group_by = 'day',) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/calendarcaptures/2?url=${url}&date=${date}&groupby=${group_by}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export async function GetWaybackTimemap
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
        options: wayback_fetch_options,
        handler: async (res) => {
            let supra: $WaybackTimeMapObject[] = await wayback_fetch_handler(res);
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

export async function BulkDownloader(urllist: $URLListObject[], downloaded_urllist: String[], failed_urllist: String[], interval = 1000) {
    for (let url_obj of urllist) {
        let url = url_obj.wayback_url;
        if (downloaded_urllist.includes(url) || failed_urllist.includes(url)) {
            console.log(`Skipping ${url}`);
            continue;
        }
        console.log(`Fetching ${url}`);
        try {
            let url_test = URL.parse(url);
            if (!url_test) continue;
            console.log(url_test);
            // let res = await FetchWrapper(url, {
            //     handler: async (res) => Buffer.from(await res.arrayBuffer())
            // });
            // if (res instanceof Buffer) continue{
            // let r = url.match(wayback_regex);
            // let groups = r?.groups;
            // if (groups) {
            //     let resource = groups.resource.split('?')[0];
            //     let resource_output_path = path.join(DIR(), 'web', resource.split(TARGET_URL)[1]); // add some form of 'target_url' between web and the actual resource to split by domains
            //     console.log(`Writing ${resource_output_path}`);
            //     fs.writeFileSync(resource_output_path, res);
            //     fs.appendFileSync(path.join(DIR(), 'downloaded_urllist.txt'), downloaded_urllist.length > 0 ? '\n' + url : url);
            // }
            // }
        } catch (e) {
            fs.appendFileSync(path.join(DIR(), 'failed_urllist.txt'), failed_urllist.length > 0 ? '\n' + url : url);
        }
        await Delay(interval);
    }
}