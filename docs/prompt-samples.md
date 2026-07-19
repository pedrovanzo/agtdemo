# Agentic Code — Prompt Samples

Group 1: Component / Section Level
Goal: Test the model's ability to handle micro-layouts, isolated JavaScript logic, state changes, and specific DOM manipulations.

Prompt 1: Interactive Pricing Matrix with Annual Toggle
Build a responsive 3-tier pricing matrix section (Starter, Pro, Enterprise). The Pro tier should be visually highlighted as "Most Popular." Include a functional toggle switch at the top to change the pricing data between "Monthly" and "Annual" billing, dynamically updating the prices and adding a "Save 20%" badge to the annual rates.

Prompt 2: Advanced Search Filter Sidebar
Create a sidebar component designed for filtering product searches. It must include a collapsible category accordion, a functional range slider for price filtering that displays the current minimum/maximum selected values, and a list of clickable checkbox tags that visually change state when selected.

Prompt 3: Audio Player Controller Section
Design a modern web audio player interface component. It needs a track information layout (title, artist, placeholder cover art), a progress bar that simulates a timeline, time stamps (current time/total duration), and playback controls (play/pause toggle, skip, mute/volume slider). The play/pause button must toggle its icon state when clicked.

Group 2: Full Single-Page / Landing Page Level
Goal: Test the model's grasp of overall page architecture, visual hierarchy, responsive breakpoints, and combining multiple UI blocks smoothly.

Prompt 4: Real Estate Property Listing Portal
Generate a complete landing page for a premium real estate agency. The page must feature a hero section with an advanced search bar, a grid displaying available properties with filtering tabs (All, Buy, Rent), an "Our Agents" carousel layout, and a functional mortgage calculator widget where users can input home value and down payment to see a monthly payment estimate.

Prompt 5: Creative Agency Portfolio with Dark/Light Toggle
Create a single-page portfolio for a design studio. It must feature a minimal typography-focused hero section, a filterable work gallery section, a "Services" interactive accordion menu, and a floating action button (FAB) that toggles the entire page theme between a refined light mode and a deep dark mode seamlessly.

Prompt 6: Event Conference Dashboard Landing Page
Build a landing page for a tech conference. The layout requires a countdown timer section ticking down to a specific future date, a tabbed daily schedule section (Day 1, Day 2, Day 3) that switches the visible speaker sessions when clicked, a speaker profile grid, and a ticket registration form section with live validation.

Group 3: Simple Multi-File Application Level
Goal: Evaluate how your assistant structures code across multiple files, handles state persistence, scales architecture, and maintains clean data flow.

Prompt 7: Local Pomodoro Productivity Tracker
Build a multi-file Pomodoro timer application. It needs a main dashboard file (index.html) linking to separate logic (app.js) and styling or component definition files. The app must feature customizable work/break intervals, an audio alert or visual flash when a timer hits zero, and a historical log section tracking completed sessions that persists in localStorage.

Prompt 8: Flashcard Learning App with Score System
Create a multi-file flashcard application for studying. The architecture should separate the core UI, the flashcard data deck array, and the application state logic. Features must include the ability to flip cards to see answers, mark answers as "Correct" or "Incorrect," track a running score, and view a summary screen at the end of the deck with a reset option.

Prompt 9: Recipe Book Manager
Generate a multi-file Recipe Book application. The app should have an main entry point and separate files for the application state handling. It must allow users to view a list of recipes, click a recipe to view its full details (ingredients and steps), add a new recipe via a modal form, and include a simple text search input that filters the recipe list in real-time.

Group 4: Backend / Script Level
Goal: Evaluate the model's grasp of standard-library-only Python, local file/data persistence, and small CLI tool structure — once real backend generation exists (not yet wired; frontend-only today per ADR 0003).

Prompt 10: Text-Based Todo List Manager
Create a command-line Todo List application in Python. The app should store tasks in a local JSON file so data persists between runs. It needs to allow the user to: 1) Add a task with a title and optional description, 2) View all active tasks, 3) Mark a task as complete, and 4) Delete a task. Keep the code in a single file using only the Python standard library (json, os).

Prompt 11: Local File Rename & Organizer Utility
Write a Python script that organizes a target folder by sorting files into subdirectories based on their file extensions (e.g., all .jpg and .png files go into an "Images" folder, .pdf and .docx into "Documents"). If a file doesn't match a common category, move it to a "Miscellaneous" folder. The script should prompt the user for the folder path and use only the os, shutil, and pathlib standard libraries.

Prompt 12: Markdown to HTML Static Page Generator
Build a simple Python script that reads a specific local Markdown file (document.md) and converts it into a basic, styled HTML file (document.html). It should handle standard Markdown headers (#, ##), bullet points (*), bold text (**), and plain paragraphs. Include a simple, clean CSS block embedded in the generated HTML header for basic readability. Use only Python's built-in string manipulation and file I/O operations.

Prompt 13: Personal Expense Tracker & CSV Logger
Generate a command-line script to log and track daily expenses. The user should be able to input an expense amount, a category (e.g., Food, Transport, Utilities), and a brief note. Append each entry to a local expenses.csv file with a timestamp. Additionally, add a "View Summary" feature that reads the CSV and prints the total amount spent per category. Use only the built-in csv and datetime modules.

Prompt 14: System Performance Monitor & Alerting Tool
Create a Python script that checks the local machine's current CPU utilization, memory usage, and available disk space. Print these metrics to the console in a clean format every 5 seconds. If CPU or memory usage exceeds 80%, print a high-visibility warning message. Since this runs locally, use the standard library where possible, or specify if a lightweight library like psutil is required for cross-platform hardware access.
