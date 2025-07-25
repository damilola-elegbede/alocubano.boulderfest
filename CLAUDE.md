# A Lo Cubano Boulder Fest - Claude Configuration

## Project Overview

**A Lo Cubano Boulder Fest** is a Cuban salsa festival website featuring a **typography-forward design** that treats text as art. The site celebrates authentic Cuban culture through workshops, social dancing, and community connection in Boulder, Colorado.

### Key Details
- **Festival Dates**: May 15-17, 2026 (Friday-Sunday)
- **Location**: Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO
- **Contact**: alocubanoboulderfest@gmail.com
- **Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)
- **Founded**: 2023 by Marcela Lay
- **Growth**: From 500 attendees (2023) to expected 5,000+ (2026)

## Development Notes

### Critical Development Warnings
- **We never run no verify**: OK? It means there is something wrong when a test fails. Always investigate and fix test failures immediately.

## Server Logging

- When starting the server using `npm start`, pipe the output to a log file in `./.tmp/` directory
- Log files should follow the pattern: 
  - First log: `./.tmp/server.log`
  - Subsequent logs: `./.tmp/server_1.log`, `./.tmp/server_2.log`, etc. if file already exists