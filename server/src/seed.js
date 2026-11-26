/**
 * Development / demo seed.
 *   npm run seed            → adds sample teams + questions if the collections are empty
 *   npm run seed -- --reset → wipes teams, questions, tournaments and history first
 */
import mongoose from 'mongoose';
import { connectDB } from './db.js';
import {
  Team, Question, Category, Tournament, Round, Battle, AnswerAttempt, TournamentEvent, ensureDefaultCategories,
} from './models/index.js';

export const SAMPLE_TEAMS = [
  ['Code Crusaders', ['Aarav Sharma', 'Diya Patel', 'Kabir Singh', 'Meera Iyer']],
  ['Byte Bandits', ['Rohan Verma', 'Ananya Gupta', 'Ishaan Rao']],
  ['Null Pointers', ['Priya Nair', 'Arjun Mehta', 'Sneha Kulkarni', 'Vikram Joshi']],
  ['Syntax Squad', ['Aditya Kumar', 'Riya Desai', 'Karan Malhotra']],
  ['DOM Dominators', ['Neha Reddy', 'Siddharth Jain', 'Pooja Shetty', 'Rahul Bose']],
  ['Async Avengers', ['Tanvi Mishra', 'Yash Agarwal', 'Kavya Menon']],
  ['Pixel Pirates', ['Harsh Vardhan', 'Nisha Pillai', 'Dev Chauhan', 'Simran Kaur']],
  ['Stack Smashers', ['Manav Thakur', 'Ira Banerjee', 'Om Prakash']],
  ['Callback Kings', ['Zoya Khan', 'Aryan Kapoor', 'Lavanya Das', 'Kunal Sethi']],
  ['Flexbox Falcons', ['Shreya Ghosh', 'Nikhil Yadav', 'Tara Bhatt']],
];

const Q = (category, difficulty, questionText, correctAnswer, hint, explanation = '') => ({ category, difficulty, questionText, correctAnswer, hint, explanation });

export const SAMPLE_QUESTIONS = [
  // HTML
  Q('HTML Fundamentals', 'Easy', 'Which HTML tag is used to create a hyperlink?', '<a> (anchor tag)', 'It is a single letter and needs an href attribute.'),
  Q('HTML Fundamentals', 'Easy', 'What does HTML stand for?', 'HyperText Markup Language', 'Three of the four words describe text that links and is marked up.'),
  Q('HTML Fundamentals', 'Medium', 'Which attribute makes an input field mandatory before a form can be submitted?', 'required', 'It is a boolean attribute — its name says it all.'),
  Q('HTML Fundamentals', 'Medium', 'Which HTML element is used to define the most important heading?', '<h1>', 'Headings go from 1 to 6.'),
  Q('HTML Fundamentals', 'Medium', 'What is the purpose of the alt attribute on an <img> tag?', 'Alternative text shown when the image cannot load and read by screen readers', 'Think accessibility.'),
  Q('HTML Fundamentals', 'Hard', 'Which semantic element represents self-contained content such as a blog post that could be distributed independently?', '<article>', 'Newspapers are full of these.'),
  Q('HTML Fundamentals', 'Hard', 'What does the "defer" attribute do on a <script> tag?', 'Downloads the script in parallel and runs it after the HTML is fully parsed, in order', 'It postpones execution until the document is ready.'),
  // CSS
  Q('CSS Fundamentals', 'Easy', 'Which CSS property changes the text colour of an element?', 'color', 'It is not "text-color".'),
  Q('CSS Fundamentals', 'Easy', 'What does CSS stand for?', 'Cascading Style Sheets', 'The first word describes how rules flow down.'),
  Q('CSS Fundamentals', 'Medium', 'Which value of the display property places items in a one-dimensional row or column layout?', 'flex', 'Its container has justify-content and align-items.'),
  Q('CSS Fundamentals', 'Medium', 'In the box model, which property adds space INSIDE the border?', 'padding', 'Margin is outside; this one is inside.'),
  Q('CSS Fundamentals', 'Medium', 'Which has higher specificity: an ID selector or a class selector?', 'ID selector', 'One starts with #, the other with a dot.'),
  Q('CSS Fundamentals', 'Hard', 'What does "box-sizing: border-box" change?', 'Width and height include padding and border', 'It changes what the width value measures.'),
  Q('CSS Fundamentals', 'Hard', 'Which position value keeps an element in normal flow until a scroll threshold, then fixes it?', 'sticky', 'It sticks.'),
  // JavaScript
  Q('JavaScript Fundamentals', 'Easy', 'What is the output of typeof null in JavaScript?', '"object"', 'It is a special JavaScript value that represents an intentional absence of an object.', 'A long-standing bug from the first version of JavaScript.'),
  Q('JavaScript Fundamentals', 'Easy', 'Which keyword declares a block-scoped variable that cannot be reassigned?', 'const', 'Short for constant.'),
  Q('JavaScript Fundamentals', 'Medium', 'What does the === operator check that == does not?', 'Type equality (strict comparison without type coercion)', 'Think about "5" vs 5.'),
  Q('JavaScript Fundamentals', 'Medium', 'What is the result of [1, 2, 3].map(x => x * 2)?', '[2, 4, 6]', 'map returns a new array of the same length.'),
  Q('JavaScript Fundamentals', 'Medium', 'What will 0.1 + 0.2 === 0.3 evaluate to?', 'false', 'Floating point numbers are not always exact.'),
  Q('JavaScript Fundamentals', 'Hard', 'What is a closure in JavaScript?', 'A function that remembers variables from the scope where it was created', 'Inner functions keep access to outer variables.'),
  Q('JavaScript Fundamentals', 'Hard', 'Which runs first: a resolved Promise callback (microtask) or a setTimeout(fn, 0) callback?', 'The Promise callback (microtask)', 'Microtasks run before the next macrotask.'),
  // DOM
  Q('JavaScript DOM Manipulation', 'Easy', 'Which method selects an element by its id?', 'document.getElementById()', 'The method name literally includes "Id".'),
  Q('JavaScript DOM Manipulation', 'Easy', 'Which method attaches an event handler to an element?', 'addEventListener()', 'You "add" a "listener".'),
  Q('JavaScript DOM Manipulation', 'Medium', 'What is the difference between textContent and innerHTML?', 'textContent sets plain text; innerHTML parses the string as HTML', 'One of them can create elements from a string.'),
  Q('JavaScript DOM Manipulation', 'Medium', 'Which method returns the FIRST element matching a CSS selector?', 'document.querySelector()', 'Its sibling ends with "All".'),
  Q('JavaScript DOM Manipulation', 'Medium', 'Which event fires when the initial HTML document has been completely loaded and parsed?', 'DOMContentLoaded', 'It does not wait for images and stylesheets.'),
  Q('JavaScript DOM Manipulation', 'Hard', 'What does event.stopPropagation() do?', 'Stops the event from bubbling up to parent elements', 'Bubbling goes upward…'),
  Q('JavaScript DOM Manipulation', 'Hard', 'What is event delegation?', 'Attaching one listener to a parent to handle events from its children via bubbling', 'One listener, many children.'),
  // Networks
  Q('Computer Networks', 'Easy', 'What does IP stand for in "IP address"?', 'Internet Protocol', 'The second word is "Protocol".'),
  Q('Computer Networks', 'Easy', 'Which protocol translates domain names into IP addresses?', 'DNS (Domain Name System)', 'The internet’s phone book.'),
  Q('Computer Networks', 'Medium', 'What is the default port for HTTPS?', '443', 'HTTP uses 80.'),
  Q('Computer Networks', 'Medium', 'Which transport protocol is connection-oriented and guarantees delivery: TCP or UDP?', 'TCP', 'It uses a three-way handshake.'),
  Q('Computer Networks', 'Medium', 'How many layers does the OSI model have?', '7', 'More than five, fewer than ten.'),
  Q('Computer Networks', 'Hard', 'What are the three steps of the TCP handshake?', 'SYN, SYN-ACK, ACK', 'Synchronise and acknowledge.'),
  Q('Computer Networks', 'Hard', 'What does a 404 HTTP status code mean?', 'Not Found — the server cannot find the requested resource', '4xx codes are client errors.'),
  // Web dev
  Q('Web Development Fundamentals', 'Easy', 'What does URL stand for?', 'Uniform Resource Locator', 'It locates a resource.'),
  Q('Web Development Fundamentals', 'Easy', 'Which HTTP method is typically used to submit form data that creates a resource?', 'POST', 'GET reads; this one sends.'),
  Q('Web Development Fundamentals', 'Medium', 'What does JSON stand for?', 'JavaScript Object Notation', 'It looks like JavaScript objects.'),
  Q('Web Development Fundamentals', 'Medium', 'What is the purpose of the <meta name="viewport"> tag?', 'Controls page width and scaling on mobile devices', 'Responsive design needs it.'),
  Q('Web Development Fundamentals', 'Medium', 'Where is localStorage data stored?', 'In the browser, per origin, with no expiry', 'It survives closing the tab.'),
  Q('Web Development Fundamentals', 'Hard', 'What does CORS stand for?', 'Cross-Origin Resource Sharing', 'It is about requests across origins.'),
  Q('Web Development Fundamentals', 'Hard', 'What is the difference between a cookie with HttpOnly and one without?', 'HttpOnly cookies cannot be read by JavaScript (document.cookie)', 'It protects against XSS stealing cookies.'),
];

export async function seed({ reset = false } = {}) {
  if (reset) {
    await Promise.all([
      Team.deleteMany({}), Question.deleteMany({}), Tournament.deleteMany({}), Round.deleteMany({}),
      Battle.deleteMany({}), AnswerAttempt.deleteMany({}), TournamentEvent.deleteMany({}),
    ]);
  }
  await ensureDefaultCategories();
  const cats = new Map((await Category.find().lean()).map((c) => [c.name, c._id]));
  let teams = 0;
  let questions = 0;
  if ((await Team.countDocuments()) === 0) {
    for (const [teamName, members] of SAMPLE_TEAMS) {
      await Team.create({ teamName, members: members.map((name) => ({ name })) });
      teams += 1;
    }
  }
  if ((await Question.countDocuments()) === 0) {
    await Question.insertMany(SAMPLE_QUESTIONS.map((q) => ({ ...q, category: cats.get(q.category) })));
    questions = SAMPLE_QUESTIONS.length;
  }
  return { teams, questions };
}

if (process.argv[1]?.endsWith('seed.js')) {
  const reset = process.argv.includes('--reset');
  connectDB()
    .then(() => seed({ reset }))
    .then((r) => {
      console.log(`Seed complete${reset ? ' (after reset)' : ''}: ${r.teams} teams, ${r.questions} questions added.`);
      return mongoose.disconnect();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
