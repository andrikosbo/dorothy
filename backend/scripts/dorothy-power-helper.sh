#!/bin/zsh
set -euo pipefail

PMSET=/usr/bin/pmset

case "${1:-}" in
  install-wake-schedule)
    "$PMSET" repeat \
      wakeorpoweron MTWRFSU 05:55:00 \
      shutdown MTWRFSU 23:30:00
    ;;
  schedule-second-wake)
    if [[ "$(/bin/date '+%H%M')" -ge 755 ]]; then
      wake_date="$(/bin/date -v+1d '+%m/%d/%y')"
    else
      wake_date="$(/bin/date '+%m/%d/%y')"
    fi
    "$PMSET" schedule wakeorpoweron "$wake_date 07:55:00"
    ;;
  sleep)
    "$PMSET" sleepnow
    ;;
  shutdown)
    /sbin/shutdown -h now
    ;;
  restart)
    /sbin/shutdown -r now
    ;;
  status)
    "$PMSET" -g sched
    ;;
  *)
    echo "Allowed actions: install-wake-schedule, schedule-second-wake, sleep, shutdown, restart, status" >&2
    exit 64
    ;;
esac
