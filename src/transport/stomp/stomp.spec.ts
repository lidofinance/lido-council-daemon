import StompClient from './stomp.client';
import { WebSocketMock } from './stomp.mock';

const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

describe('StompClient', () => {
  describe('regular cases', () => {
    let server: WebSocketMock;
    let stompClient: StompClient;
    let connectCallback: any;
    let errorCallback: any;

    beforeEach(async () => {
      connectCallback = jest.fn();
      errorCallback = jest.fn();
      stompClient = new StompClient({
        url: 'ws://localhost:1234',
        login: null,
        passcode: null,
        connectCallback,
        errorCallback,
        getWebSocket() {
          server = new WebSocketMock();
          return server;
        },
        options: {
          reconnectAttempts: 1,
          reconnectTimeout: 10,
        },
      });

      await stompClient.connect();
    });

    it('should connect to the WebSocket server and handle CONNECTED frame', async () => {
      expect(connectCallback).toHaveBeenCalled();
      expect(stompClient.isConnected()).toBeTruthy();
      expect(stompClient.isOpened()).toBeTruthy();
    });

    it('should handle ERROR frame', async () => {
      server.emitConnectError();
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should handle disconnection', async () => {
      expect(connectCallback).toHaveBeenCalled();
      expect(stompClient.isConnected()).toBeTruthy();
      expect(stompClient.isOpened()).toBeTruthy();

      server.closeServer(1000);

      expect(stompClient.isConnected()).toBeFalsy();
    });

    it('should handle disconnection and reconnect to the WebSocket server', async () => {
      expect(connectCallback).toHaveBeenCalled();
      expect(stompClient.isConnected()).toBeTruthy();
      expect(stompClient.isOpened()).toBeTruthy();

      server.closeServer(1006);
      // waiting for reconnection promise
      await wait();

      await stompClient.getReconnectionPromise();

      expect(stompClient.isConnected()).toBeTruthy();
      expect(stompClient.isOpened()).toBeTruthy();
    });

    it('should send a message to the WebSocket server', async () => {
      expect(connectCallback).toHaveBeenCalled();
      expect(stompClient.isConnected()).toBeTruthy();
      expect(stompClient.isOpened()).toBeTruthy();

      const destination = '/queue/test';
      const headers = { key: 'value' };
      const body = 'test message';

      await stompClient.send(destination, headers, body);
      const message = server.getLastMessage();

      expect(message.command).toBe('SEND');
      expect(message.headers.key).toBe(headers.key);
      expect(message.headers.destination).toBe(destination);
      expect(message.body).toBe(body);
    });
  });

  describe('reconnection', () => {
    let server: WebSocketMock;

    it.each([1, 2, 3])(
      'by server close reason with attempts [%i]',
      async (reconnectAttempts) => {
        expect.assertions(6);
        let status = true;
        const connectCallback = jest.fn();
        const errorCallback = jest.fn();
        const stompClient = new StompClient({
          url: 'ws://localhost:1234',
          login: null,
          passcode: null,
          connectCallback,
          errorCallback,
          getWebSocket() {
            server = new WebSocketMock();
            server.setServerStatus(status);
            return server;
          },
          options: {
            reconnectAttempts,
            reconnectTimeout: 10,
          },
        });

        await stompClient.connect();
        expect(connectCallback).toHaveBeenCalled();
        expect(stompClient.isConnected()).toBeTruthy();
        expect(stompClient.isOpened()).toBeTruthy();
        status = false;
        server.closeServer(1006);
        // waiting for reconnection promise
        await wait();

        await expect(
          stompClient.getReconnectionPromise(),
        ).rejects.toMatchObject({
          message: 'network error',
          reconnectAttempts,
        });
        expect(stompClient.isConnected()).toBeFalsy();
        expect(stompClient.isOpened()).toBeTruthy();
      },
    );

    it.each([1, 2, 3])(
      'by server error reason with attempts [%i]',
      async (reconnectAttempts) => {
        expect.assertions(6);
        let status = true;
        const connectCallback = jest.fn();
        const errorCallback = jest.fn();
        const stompClient = new StompClient({
          url: 'ws://localhost:1234',
          login: null,
          passcode: null,
          connectCallback,
          errorCallback,
          getWebSocket() {
            server = new WebSocketMock();
            server.setServerStatus(status);
            return server;
          },
          options: {
            reconnectAttempts,
            reconnectTimeout: 10,
          },
        });

        await stompClient.connect();
        expect(connectCallback).toHaveBeenCalled();
        expect(stompClient.isConnected()).toBeTruthy();
        expect(stompClient.isOpened()).toBeTruthy();
        status = false;
        server.emitServerError();
        // waiting for reconnection promise
        await wait();

        await expect(
          stompClient.getReconnectionPromise(),
        ).rejects.toMatchObject({
          message: 'network error',
          reconnectAttempts,
        });
        expect(stompClient.isConnected()).toBeFalsy();
        expect(stompClient.isOpened()).toBeTruthy();
      },
    );

    it.each([1, 2, 3])(
      'send message with attempts [%i]',
      async (reconnectAttempts) => {
        expect.assertions(6);
        let status = true;
        const connectCallback = jest.fn();
        const errorCallback = jest.fn();
        const stompClient = new StompClient({
          url: 'ws://localhost:1234',
          login: null,
          passcode: null,
          connectCallback,
          errorCallback,
          getWebSocket() {
            server = new WebSocketMock();
            server.setServerStatus(status);
            return server;
          },
          options: {
            reconnectAttempts,
            reconnectTimeout: 10,
          },
        });

        await stompClient.connect();
        expect(connectCallback).toHaveBeenCalled();
        expect(stompClient.isConnected()).toBeTruthy();
        expect(stompClient.isOpened()).toBeTruthy();
        status = false;
        server.closeServer(1000);

        await expect(stompClient.send('/some/path')).rejects.toMatchObject({
          message: 'network error',
          reconnectAttempts,
        });
        expect(stompClient.isConnected()).toBeFalsy();
        expect(stompClient.isOpened()).toBeTruthy();
      },
    );
  });
});
