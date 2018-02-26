import { setImmediate } from './setImmediate';
import { ElapsedTimeEstimator } from './elapsedTimeEstimator';
import * as assert from 'assert';
import { Runtime, isDeepRuntime } from 'stopify-continuations/dist/src/runtime';

/**
 * Instance of a runtime extended with the suspend() function. Used by
 * instrumented programs produced by stopify.
 */
export class RuntimeWithSuspend {

  // Runtime value representing the amount of stack frames available to the
  // program.
  public remainingStack: number;

  constructor(
    /**
     * Abstract runtime used to implement stack saving and restoring logic
     */
    public rts: Runtime,
    public yieldInterval: number,

    /**
     * Used to estimate when the program should be suspended.
     */
    public estimator: ElapsedTimeEstimator,

    // The maximum number of stack frames that the program is allowed to consume.
    public stackSize: number,

    /** The runtime system yields control whenever this function produces
     * 'true' or when the estimated elapsed time exceeds 'yieldInterval'.
     */
    public mayYield = function(): boolean { return false },

    /** This function is applied immediately before stopify yields control to
     *  the browser's event loop. If the function produces 'false', the
     *  computation terminates.
     */
    public onYield = function(continuation: () => any): boolean { return true; },

    /**
     * Called when execution reaches the end of any stopified module.
     */
    public onEnd = function() { },
    public continuation = function() {}) {

    this.remainingStack = this.stackSize;
  }

  // Resume a suspended program.
  resumeFromCaptured(): any {
    return this.rts.resumeFromSuspension(this.continuation);
  }

  /**
   * Call this function to suspend a running program. When called, it initiates
   * stack capturing by calling the `captureCC` function defined by the current
   * runtime.
   *
   * Internally uses stopify's timing mechanism to decide whether or not to
   * suspend.
   *
   * @param force forces a suspension when `true`.
   */
  suspend(force?: boolean): void {
    if (this.rts.isSuspended) { debugger; }
    assert(!this.rts.isSuspended, 'already suspended');

    // Do not suspend inside a nested runtime. This is used to make sure that
    // modules that are `require`d do not try to suspend.
    // (Specifics of delimitDepth documented in abstractRun.ts)
    if (this.rts.delimitDepth > 1) {
      return;
    }

    // If there are no more stack frame left to be consumed, save the stack
    // and continue running the program.
    if (isDeepRuntime(this.rts) &&  this.remainingStack <= 0) {
      this.remainingStack = this.stackSize;
      this.rts.isSuspended = true;

      return this.rts.captureCC((continuation) => {
        if(this.onYield(continuation)) {
          this.rts.isSuspended = false;
          return continuation();
        }
      })
    }

    if (force || this.mayYield() ||
        (this.estimator.elapsedTime() >= this.yieldInterval)) {

      if (isDeepRuntime(this.rts)) {
        this.remainingStack = this.stackSize;
      }

      this.estimator.reset();
      this.rts.isSuspended = true;
      return this.rts.captureCC((continuation) => {
        this.continuation = continuation;

        if (this.onYield(continuation)) {
          return setImmediate(() => {
            this.rts.resumeFromSuspension(continuation);
          });
        }
      });
    }
  }
}
