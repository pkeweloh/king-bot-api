/**
 * Manages the session-specific state required for mimicking browser behavior in API requests,
 * particularly for the ping mechanism and tracking event IDs and timestamps.
 */
export class SessionManager {
	/** @internal Incremental counter for pings, resets on new session */
	private cnt: number = 1;
	/** @internal The latest event ID returned by the server, used to acknowledge event processing */
	private lastId: number = 0;
	/** @internal The timestamp (&t) of the immediately preceding API request, used for link-tracking */
	private lastGlobalMessageTime: number = 0;
	/** @internal The timestamp of the most recent non-ping action (e.g., building upgrade) */
	private lastActionTimestamp: number = 0;

	/**
     * Resets the session state. Should be called after a successful login.
     */
	public reset(): void {
		this.cnt = 1;
		this.lastId = 0;
		this.lastGlobalMessageTime = Math.floor(Date.now() / 100) / 10;
		this.lastActionTimestamp = 0;
	}

	/**
     * Registers a new interaction (ping or action) to track its timestamp for the next ping.
     * @param timestamp The timestamp (&t) used for the current request.
     * @param isAction Whether this interaction is a manual action (vs a background ping).
     */
	public registerInteraction(timestamp: number, isAction: boolean): void {
		this.lastGlobalMessageTime = Math.floor(timestamp / 100) / 10;
		if (isAction) {
			this.lastActionTimestamp = timestamp;
		}
	}

	/**
     * Updates the session state based on the result of a ping request.
     * @param responseData The 'response.data' field from the API response.
     */
	public updateFromPingResponse(responseData: any): void {
		if (responseData !== undefined && typeof responseData === 'number') {
			this.lastId = responseData;
		}
	}

	/**
     * Assembles the parameters for a ping request following browser patterns.
     * Includes threshold logic for the 'lc' parameter.
     * @param currentTimestamp The timestamp to be used for this ping.
     * @returns The params object for the ping payload.
     */
	public getPingParams(currentTimestamp: number): any {
		const params: any = {
			cnt: this.cnt++,
			lastGlobalMessageTime: this.lastGlobalMessageTime,
			lastId: this.lastId,
			// Standard obfuscated serializations captured from browser sessions.
			// 'c' likely tracks cache state, 't' likely tracks recent client events.
			c: 'ywj7jijsjin9SiS6ywjwCxj7jijsjijsjildSii6ywjwCxjwX9',
			t: 'eIIpIAOAIEOtfwMIeIIoLIIpIAOAIEOAIIOtfwMIeIIoLIIof1'
		};

		/**
         * 'lc' (Last Call/Component) tracking:
         * The browser mimics manual interaction cycles. If a ping occurs very shortly after
         * a manual action (within ~15s), the 'lc' is omitted. Otherwise, it sends the
         * timestamp of that last action as a reference point.
         */
		const timeSinceAction = currentTimestamp - this.lastActionTimestamp;
		if (this.lastActionTimestamp !== 0 && timeSinceAction > 15000) {
			params.lc = this.lastActionTimestamp;
		}

		return params;
	}
}
