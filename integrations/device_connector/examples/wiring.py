"""Replace stubs with the team's existing hardware callbacks; defaults refuse action."""
from hostelxpress_link import Command, HostelxpressLink


def can_unlock(command: Command) -> bool:
    # Read your real active order/compartment, fault flags, and fresh lid sensors.
    # Return True only if the command matches the assignment and all interlocks.
    return False


def unlock_confirmed(command: Command) -> bool:
    # Delegate to your existing STM32/controller bridge, then confirm execution.
    # Do not return True merely because a serial write was queued.
    raise NotImplementedError("Attach the hardware team's confirmed unlock function")


def clock_is_synchronized() -> bool:
    # Check your actual OS time-sync health; a plausible wall clock is insufficient.
    return False


if __name__ == "__main__":
    link = HostelxpressLink.from_env(guard=can_unlock, on_unlock=unlock_confirmed,
                                   clock_synchronized=clock_is_synchronized)
    try:
        link.connect()
        # Your existing application invokes report_telemetry/report_loaded/
        # report_arrived/report_lid_event from its actual sensor/navigation events.
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        link.close()
