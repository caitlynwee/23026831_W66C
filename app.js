const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const sessions = require('express-session')
const app = express();

// code for log-in sessions using linked-in certs code
app.use(sessions({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

//set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req,file,cb) => {
        cb(null,'public/images'); //directory to save uploaded files
    },
    filename: (req,file,cb) => {
        cb(null,file.originalname)
    }
});

const upload = multer({ storage:storage });

// establish a connetion to the database using mysql
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'moodTracker'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({
  extended: false
}));

// ========================================================================================================================================================================================================================================================================================================================
// LOGIN, REGISTER, AND LOGOUT ROUTES
// ========================================================================================================================================================================================================================================================================================================================

// GET register route
app.get('/register', (req, res) => {
  res.render('register');
});

// POST register route
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const sql = 'INSERT INTO account (username, password) VALUES (?, ?)';
  
  connection.query(sql, [username, password], (error, results) => {
    if (error) {
      console.error("Error registering user:", error);
      res.status(500).send('Error registering user');
    } else {
      req.session.userId = results.insertId; // automatically log in the user upon registration
      // insertId is an automatically generated ID that is given to newly INSERTed rows that is using auto-increment, which the userId is using.
      res.redirect('/');
    }
  });
});

// GET login route
app.get('/login', (req, res) => {
  res.render('login');
});

// POST login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // when the username is inputted in the form, SQL is queried in order to find the matching username
  const sql = 'SELECT * FROM account WHERE username = ?';

  connection.query(sql, [username], (error, results) => {
    if (error) {
      console.error("Error during login:", error);
      return res.status(500).send('Login failed');
    }
    
    if (results.length > 0) {
      const user = results[0];
      // when username is found, the password inputted from the login form is matched with the user's password in the account table.
      if (password === user.password) {
        req.session.userId = user.userId;
        return res.redirect('/');
      }
    }
    
    return res.status(401).send('Invalid login credentials');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) {
      console.error("Error destroying session:", err);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/login');
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// MOOD INDEX ROUTES
// ========================================================================================================================================================================================================================================================================================================================

// Define routes
app.get('/', (req, res) => {
  if (!req.session.userId) {
    res.redirect('/login');
    return;
    // this code is used to check if the session userId is valid (matches with the userId in account table). if not, it redirects to the login page.
  }
  const userId = req.session.userId;
  const sql = 'SELECT * FROM moodTracker WHERE userId = ?';
  //Fetch data from MySQL
  connection.query(sql, [userId], (error, results) => {
    if (error) {
        res.render('/addMood');
      }
      //Render HTML page with data
    res.render('index', {moodTracker:results})
  });
});

app.get('/mood/:id', (req,res) => {
  const logId = req.params.id;
  const sql = 'SELECT * FROM moodTracker WHERE logId = ?';
  connection.query(sql, [logId], (error, results) => {
    if (error) {
      console.error("Error fetching mood:", error);
      res.status(500).send('Error fetching mood');
    } else {
      res.render('mood', {moodTracker:results[0]});
    }
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// MOOD ADD, EDIT, AND DELETE ROUTES
// ========================================================================================================================================================================================================================================================================================================================

app.get('/addMood', (req,res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.render('addMood');
});

app.post('/addMood/', upload.single('newEmoji'), (req,res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const { mood, moodDesc, log_date } = req.body;
  let { emoji } = req.body;

  // if a file is uploaded as newEmoji, use filename as emoji
  if (req.file) {
      emoji = req.file.filename;
  } else {
    // endsWith method checks if the emoji text input ends with .png
    // if not, it will be automatically added by the below code.
    // this is to make it so that the user does not need to manually type '.png' at the end of their emoji
    // if instead, a file is uploaded through newEmoji file upload,
    // it will bypass this code because the newEmoji should already automatically end with .png
    if (!emoji.endsWith('.png')) {
      emoji += '.png';
    }
  }
  const sql = 'INSERT INTO moodTracker (mood, emoji, moodDesc, log_date, userId) VALUES (?, ?, ?, ?, ?)';
  //Insert the new mood into the database
  connection.query( sql, [mood, emoji, moodDesc, log_date, req.session.userId], (error,results) => {
      if (error) {
          //Handle any error that occurs during database operation
          console.error("Error adding mood:", error);
          res.status(500).send('Error adding mood');
      } else {
          //Send a success response
          res.redirect('/');
      }
  });
});

app.get('/editMood/:id', (req,res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const logId = req.params.id;
  const sql = 'SELECT * FROM moodTracker WHERE logId = ?';
  connection.query(sql, [logId], (error, results) => {
    if (error) {
      console.error("Error fetching mood:", error);
      res.status(500).send('Error fetching mood');
    } else {
      res.render('editMood', {moodTracker:results[0]});
    }
  });
});

app.post('/editMood/:id', upload.single('newEmoji'), (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const logId = req.params.id;
  const { mood, moodDesc, log_date } = req.body;
  let emoji = req.body.emoji || req.body.currentEmoji;
  // req.body.emoji defines that the emoji will be set using the text field input
  // OR statement '||' defines that if currentEmoji is ALREADY available, emoji will be set as currentEmoji (in other words, emoji remains unchanged)
  // if newEmoji is updated using the file upload field, it will be used as the new emoji
  if (req.file) {
    emoji = req.file.filename;
  } else {
    // endsWith method checks if the emoji text input ends with .png
    // if not, it will be automatically added by the below code.
    // if a file is uploaded through newEmoji file upload,
    // it will bypass this code because the newEmoji should automatically end with .png
    if (!emoji.endsWith('.png')) {
      emoji += '.png';
    }
  }
  const sql = 'UPDATE moodTracker SET mood = ?, emoji = ?, moodDesc = ?, log_date = ? WHERE logId = ?';
  connection.query(sql, [mood, emoji, moodDesc, log_date, logId], (error, results) => {
    if (error) {
      console.error("Error updating mood:", error);
      res.status(500).send('Error updating mood');
    } else {
      res.redirect('/');
    }
  });
});

app.get('/deleteMood/:id', (req,res) => {
  const logId = req.params.id;
  const sql = 'DELETE FROM moodTracker WHERE logId = ?';
  connection.query( sql, [logId], (error,results) => {
      if (error) {
          //handle any error that occurs during the database operation
          console.error("Error deleting mood:", error);
          res.status(500).send('Error deleting mood');
      } else {
          //send a success response
          res.redirect('/');
      }
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// TASK INDEX ROUTES
// ========================================================================================================================================================================================================================================================================================================================

app.get('/tasks', (req, res) => {
  if (!req.session.userId) {
    res.redirect('/login');
    return;
  }
  const userId = req.session.userId;
  const sql = 'SELECT * FROM tasks WHERE userId = ?';
  //Fetch data from MySQL
  connection.query(sql, [userId], (error, results) => {
    if (error) {
        res.render('/addTasks');
      }
      //Render HTML page with data
    res.render('tasks', {tasks:results})
  });
});

app.get('/task/:id', (req,res) => {
  const taskId = req.params.id;
  const sql = 'SELECT * FROM tasks WHERE taskId = ?';
  connection.query(sql, [taskId], (error, results) => {
    if (error) {
      console.error("Error fetching task:", error);
      res.status(500).send('Error fetching task');
    } else {
      res.render('task', {tasks:results[0]});
    }
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// TASK ADD, EDIT, AND DELETE ROUTES
// ========================================================================================================================================================================================================================================================================================================================

app.get('/addTasks', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.render('addTasks');
});

app.post('/addTasks/', (req,res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const { task, taskdesc, tasklogdate, taskduedate } = req.body;

  const sql = 'INSERT INTO tasks (task, taskdesc, tasklogdate, taskduedate, userId) VALUES (?, ?, ?, ?, ?)';
  //Insert the new product into the database
  connection.query( sql, [task, taskdesc, tasklogdate, taskduedate, req.session.userId], (error,results) => {
      if (error) {
          //Handle any error that occurs during database operation
          console.error("Error adding mood:", error);
          res.status(500).send('Error adding mood');
      } else {
          //Send a success response
          res.redirect('/tasks');
      }
  });
});

app.get('/editTasks/:id', (req,res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const taskId = req.params.id;
  const sql = 'SELECT * FROM tasks WHERE taskId = ?';
  connection.query(sql, [taskId], (error, results) => {
    if (error) {
      console.error("Error fetching task:", error);
      res.status(500).send('Error fetching task');
    } else {
      res.render('editTasks', {tasks:results[0]});
    }
  });
});

app.post('/editTasks/:id', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const taskId = req.params.id;
  const { task, taskdesc, tasklogdate, taskduedate } = req.body;

  const sql = 'UPDATE tasks SET task = ?, taskdesc = ?, tasklogdate = ?, taskduedate = ? WHERE taskId = ?';
  connection.query(sql, [task, taskdesc, tasklogdate, taskduedate, taskId], (error, results) => {
    if (error) {
      console.error("Error updating task:", error);
      res.status(500).send('Error updating task');
    } else {
      res.redirect('/tasks');
    }
  });
});

app.get('/deleteTask/:id', (req,res) => {
  const taskId = req.params.id;
  const sql = 'DELETE FROM tasks WHERE taskId = ?';
  connection.query( sql, [taskId], (error,results) => {
      if (error) {
          //handle any error that occurs during the database operation
          console.error("Error deleting task:", error);
          res.status(500).send('Error deleting task');
      } else {
          //send a success response
          res.redirect('/tasks');
      }
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// USER DELETE ROUTE
// ========================================================================================================================================================================================================================================================================================================================

// delete user is specified as a post because it takes a form, in order to get the session userId to use it to DELETE from account table
app.post('/deleteUser', (req, res) => {
  if (!req.session.userId) {
    res.redirect('/login');
    return;
  }
  const userId = req.session.userId;
  // userId is defined by the current sessions userId, as the currently logged in user's ID will match with the database's userId for that user.
  const sql = 'DELETE from account WHERE userId = ?';
  connection.query(sql, [userId], (error, results) => {
    if (error) {
      console.error("Error deleting user: ", error);
      res.status(500).send('Error deleting mood');
    } else {
      req.session.destroy((error) => {
        if (error) {
          console.error("Error destroying session: ", error);
          return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
      });
    }
  });
});

// ========================================================================================================================================================================================================================================================================================================================
// Localhost PORT and console.log
// ========================================================================================================================================================================================================================================================================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));