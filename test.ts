import { WaybackDatabaseInterface } from "./wayback_database_interface.ts";

let intf = new WaybackDatabaseInterface();
let db = intf.Connect('https://404.jodi.org');

