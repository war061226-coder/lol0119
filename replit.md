# LoL Team Balancer

## Overview

This is a League of Legends team balancer application that fetches player data from the OP.GG API and creates balanced 5v5 teams. The system analyzes player statistics including tier, rank, MMR, win rate, and preferred positions to generate optimal team compositions.

The application consists of a React frontend with shadcn/ui components and an Express.js backend. It uses Drizzle ORM for database operations with PostgreSQL and includes a sophisticated team balancing algorithm that considers multiple factors for fair matchmaking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **API Structure**: RESTful endpoints for player data fetching and team balancing
- **Services**: 
  - OP.GG API service for fetching player statistics
  - Team balancer service with advanced algorithms
  - Storage abstraction layer supporting both memory and database storage

### Data Storage
- **Database**: PostgreSQL with Neon serverless driver
- **Schema**: Three main tables - players, teams, and balance_results
- **ORM**: Drizzle with automatic migrations and type safety
- **Fallback**: In-memory storage for development/testing

### Core Features
- **Player Data Fetching**: Retrieves summoner information, rank, MMR, win rates, and position preferences
  - **Cache System**: 10-minute cache for performance optimization
  - **Force Refresh**: Manual refresh button to bypass cache and fetch latest data from OP.GG
- **Team Balancing Algorithm**: Multi-factor analysis considering:
  - MMR differences between teams
  - Win rate balance
  - Position role distribution
  - Overall team composition scoring
- **Real-time Updates**: Live balance score calculation and team optimization
- **Preset Management**: Save and load balance settings configurations
- **Responsive UI**: Mobile-first design with dark theme support

### External Service Integration
- **Riot Games Official API**: Primary data source for 100% accurate player statistics
  - Account API: Riot ID → PUUID conversion
  - Summoner API: Player level retrieval
  - League API: Rank data (tier, division, LP, wins, losses) via PUUID endpoint
  - Development API key expires every 24 hours (requires daily regeneration)
- **HTML Parsing Fallback**: OP.GG website scraping when Riot API fails
  - Less reliable due to JavaScript-rendered content
  - May produce inaccurate tier/LP data
- **API Key Management**: Secured via Replit Secrets (RIOT_API_KEY)

### Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Code Quality**: ESBuild for production builds
- **Database Tools**: Drizzle Kit for migrations and schema management
- **Replit Integration**: Custom plugins for development environment

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL serverless database connection
- **drizzle-orm**: Type-safe ORM for database operations
- **drizzle-zod**: Schema validation integration
- **express**: Web application framework
- **@tanstack/react-query**: Server state management
- **wouter**: Lightweight React router

### UI Framework
- **@radix-ui/***: Comprehensive set of UI primitives for accessible components
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **clsx**: Conditional className utility

### Development Tools
- **vite**: Build tool and development server
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production
- **@replit/vite-plugin-***: Replit-specific development plugins

### Form and Validation
- **react-hook-form**: Performant form library
- **@hookform/resolvers**: Form validation resolvers
- **zod**: TypeScript-first schema validation

### Additional Libraries
- **date-fns**: Date manipulation utilities
- **nanoid**: Unique ID generation
- **cmdk**: Command palette component
- **embla-carousel-react**: Carousel component