import got from 'got';
// @ts-ignore
import { request } from 'http2-wrapper';

const httpClient = got.extend({ request });

export default httpClient;
