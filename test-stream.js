const make = require('stream-json/streamers/StreamArray');
const chain = require('stream-chain');
const { Parser } = require('stream-json');
const { pick }   = require('stream-json/filters/Pick');
const { finished, pipeline } = require('stream/promises');

const { createReadStream, createWriteStream, stat } = require('fs');
const StreamValues = require('stream-json/streamers/StreamValues');
const StreamArray = require('stream-json/streamers/StreamArray');
const JSONStream = require('JSONStream');
const {resolve} = require("path");

/**
 * @typedef Header
 *
 */


/**
 * @typedef Event
 *
 */

/**
 *
 * @param {string} filePath
 * @return {Promise<{ events: Event[]; header: Header }>}
 */
const readFileAsStream = async (filePath)  => {

  const fileStream = createReadStream(filePath, 'utf-8')
    .pipe(Parser.make());

  /**
   * @type {Promise<Event[]>}
   */
  const eventsPromise = new Promise(
    (resolve, reject) => {
    /**
     * @type {Event[]}
     */
    const events = [];

    fileStream
      .pipe(pick({filter: 'events'}))
      .pipe(StreamArray.make())
      .on('data', (event) => {
        events.push(event);
      })
      .on('end', () => {
        //console.log('end');
      })
      .on('finish', () => {
        //console.log('finish');
      })
      .on('close', () => {
        //console.log('close');
        resolve(events);
      })
      .on('error', (error) => {
        reject(error);
      });
  });

  /**
   * @type {Promise<Header>}
   */
  const headersPromise = new Promise(
    (resolve, reject) => {
      /**
       * @type {Header}
       */
      let headers = {};

      fileStream
        .pipe(pick({filter: 'headers'}))
        .pipe(StreamValues.make())
        .on('data', (data, i) => {
          headers = data.value;
        })
        .on('finish', () => {
          //console.log('finish');
        })
        .on('end', () => {
          //console.log('end');
        })
        .on('close', () => {
          //console.log('close');
          resolve(headers);
        })
        .on('error', (error) => {
          reject(error);
        });
    });

  const events = await eventsPromise;
  const header = await headersPromise;

  return { header, events };
}

/**
 *
 * @param {string} filePath
 * @param {Header} headers
 * @param {Event[]} events
 * @param {any} data
 */
const writeFileAsStream = (filePath, headers, events) => {
  return new Promise((resolve, reject) => {
    const jsonStream = JSONStream.stringify(
      '{ "headers": ' + JSON.stringify(headers) + ', "events": [',
      ',',
      ']}',
    );

    const fileStream = createWriteStream(filePath);

    jsonStream.pipe(fileStream);

    const chunkSize = 10000;
    let i = 0;
    while (i < events.length) {
      const end = Math.min(i + chunkSize, events.length);
      const chunk = events.slice(i, end);
      jsonStream.write(chunk);
      i = end;
    }

    jsonStream.on('end', () => {
      resolve();
    });

    jsonStream.on('error', (err) => {
      reject(err);
    })

    jsonStream.end();
  });
}




(async function main() {

  const res = await readFileAsStream('./deposit.events3.json');

  console.log(res.events.length, res.header);
  console.time('WRITE')
  await writeFileAsStream('./01-deposit.events.json', res.header, res.events);
  console.timeEnd('WRITE')

})().catch(e => console.error(e));
