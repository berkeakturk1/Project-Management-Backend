const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const users = [];

const app = express();
const port = 3001;

const client = new Client({
  host: "localhost",
  user: "postgres",
  port: 5432,
  password: "1",
  database: "postgres",
});

client.connect();

app.use(cors());
app.use(bodyParser.json());

const fetchNotes = async () => {
  try {
    const text = 'SELECT * FROM tasks';
    const res = await client.query(text);
    return res.rows;
  } catch (err) {
    console.error(err);
    return [];
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.sendStatus(401); // Unauthorized
  }

  jwt.verify(token, 'secret_key', (err, user) => {
    if (err) {
      console.error('Token verification failed:', err);
      return res.sendStatus(403); // Forbidden
    }
    req.user = user;
    console.log('Token verified, user:', user);
    next(); // Proceed
  });
};


const fetchUsers = async () => {
  try {
    const text = 'SELECT * FROM users';
    const res = await client.query(text);
    return res.rows;
  } catch (err) {
    console.error(err);
    return [];
  }
};

app.get('/api/users', async (req, res) => {
  const users = await fetchUsers();
  
  res.json(users);
});



app.get('/api/workspaceId', async (req, res) => {
  const userId = req.query.userId;
 // console.log(`Received request for workspaceId with userId: ${userId}`);

  try {
    const result = await client.query('SELECT id FROM workspaces WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      console.log('Workspace not found for user:', userId);
      return res.status(404).json({ error: 'Workspace not found for user' });
    }

    //console.log('Workspace found:', result.rows[0].id);
    res.json({ workspaceId: result.rows[0].id });
  } catch (error) {
    console.error('Error fetching workspace ID:', error);
    res.status(500).send('Server error');
  }
});




app.post('/api/taskboards', async (req, res) => {
  const { title, description, workspace_id } = req.body;

  try {
    const result = await client.query(
      'INSERT INTO taskboards (title, description, workspace_id) VALUES ($1, $2, $3) RETURNING *',
      [title, description, workspace_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating taskboard:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/taskboards', async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    console.error('No userId provided in request');
    return res.status(400).json({ error: 'userId is required' });
  }

  console.log(`Fetching taskboards for userId: ${userId}`);

  try {
    const result = await client.query(
      `SELECT tb.*
       FROM public.taskboards tb
       JOIN public.user_taskboards utb ON tb.id = utb.taskboard_id
       WHERE utb.user_id = $1`,
      [userId]
    );

    //console.log(`Query successful, rows returned: ${result.rows.length}`);
    //console.log('Result data:', result.rows);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching taskboards:', error);
    res.status(500).json({ error: 'Failed to fetch taskboards' });
  }
});

//fetch tb_id from user_id
app.get('/api/user_taskboard_id', authenticateToken, async (req, res) => {
  const userId = req.user.userId; // Assuming userId is obtained from the authenticated token

  try {
    const result = await client.query(
      'SELECT taskboard_id FROM user_taskboards WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No taskboard found for this user' });
    }

    res.json({ taskboardId: result.rows[0].taskboard_id });
  } catch (error) {
    console.error('Error fetching taskboard ID:', error);
    res.status(500).send('Server error');
  }
});


app.post('/register', async (req, res) => {
  const { username, password, userType, email, fname, lname } = req.body; // Changed Email to email
  const fullname = fname + " " + lname;
  //console.log('Register attempt:', { username, password, userType, email, fullname });
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const result = await client.query(
      'INSERT INTO users (username, password_hash, user_type, email, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, hashedPassword, userType, email, fullname] // Changed Email to email
    );

    res.status(201).send('User registered successfully');
  } catch (error) {
    console.error('Registration failed', error);
    res.status(500).send('Registration failed');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  //console.log('Login attempt:', { username, password });

  try {
    const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (user) {
      console.log('User found:', user);
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      console.log('Password valid:', isPasswordValid);
      if (isPasswordValid) {
        const token = jwt.sign({ userId: user.id, userType: user.user_type }, 'secret_key', { expiresIn: '1h' });
        res.json({ token, userType: user.user_type, userId: user.id }); // Include userId in the response
      } else {
        res.status(401).send('Invalid credentials');
      }
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    console.error('Login failed', error);
    res.status(500).send('Login failed');
  }
});


const getUserIdsFromUsernames = async (usernames) => {
  const query = 'SELECT id FROM users WHERE username = ANY($1::text[])';
  const result = await client.query(query, [usernames]);
  return result.rows.map(row => row.id);
};

// API endpoint to create a new note
app.post('/api', async (req, res) => {
  const { title, content, status, importance, taskboardId, assignedTo } = req.body;

  if (!taskboardId) {
    return res.status(400).send('Taskboard ID is required');
  }

  const newNote = {
    title,
    content,
    status: status || 'todo',
    importance: importance || 'No time Constraint',
    taskboardId
  };

  try {
    // Insert the new note into the tasks table and get the created task ID
    const result = await client.query(
      'INSERT INTO tasks (task_title, task_content, status, importance, taskboard_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [newNote.title, newNote.content, newNote.status, newNote.importance, newNote.taskboardId]
    );

    // Ensure the correct column name is used for task ID
    const createdTask = result.rows[0];
    const taskId = createdTask.m_id; // Use the correct column name for the task ID

    // Convert assignedTo (usernames) to user IDs
    const userIds = await getUserIdsFromUsernames(assignedTo);

    // Check if there are users to assign to this task
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const assignmentQueries = userIds.map(userId =>
        client.query(
          'INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2)',
          [userId, taskId]
        )
      );
      await Promise.all(assignmentQueries);
    }

    res.json(createdTask);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).send('Server error');
  }
});





// API endpoint to delete a note
app.delete('/api/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const text = 'DELETE FROM tasks WHERE m_id = $1 RETURNING *';
    const values = [id];
    
    const result = await client.query(text, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// API endpoint to update task status
app.put('/api/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, status, importance } = req.body;

  try {
    const text = 'UPDATE tasks SET task_title = $1, task_content = $2, status = $3, importance = $4 WHERE m_id = $5 RETURNING *';
    const values = [title, content, status, importance, id];
    const result = await client.query(text, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.get('/api/workforce', async (req, res) => {
  const { taskboard_id } = req.query; // Extract taskboard_id from query parameters

  if (!taskboard_id) {
    return res.status(400).json({ error: 'taskboard_id is required' });
  }

  try {
    // Fetch workforce data from the database where taskboard_id matches
    const query = `
    SELECT username from users WHERE id IN (
    SELECT user_id 
    FROM user_taskboards 
    WHERE taskboard_id = $1)`;
    const result = await client.query(query, [taskboard_id]);
    console.log('Workforce:', result.rows);
    // Send the fetched data as a JSON response
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching workforce:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

//API endpoint to fetch tasks
const fetchTasksByTaskboardId = async (taskboardId) => {
  try {
    const query = `
      SELECT *
      FROM tasks t
      WHERE t.taskboard_id = $1
    `;
    const res = await client.query(query, [taskboardId]);
    console.log('Tasks:', res.rows);
    return res.rows;
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return [];
  }
};

app.post('/api/user_taskboards', async (req, res) => {
  const { user_id, taskboard_id, role } = req.body;

  try {
    const result = await client.query(
      'INSERT INTO public.user_taskboards (user_id, taskboard_id, role) VALUES ($1, $2, $3) RETURNING *',
      [user_id, taskboard_id, role]
    );

    res.status(201).json(result.rows[0]); // Return the inserted row
  } catch (error) {
    console.error('Error adding user to taskboard:', error);
    if (error.code === '23505') { // Unique violation error code
      res.status(409).send('User is already assigned to this taskboard');
    } else {
      res.status(500).send('Server error');
    }
  }
});
app.get('/api/tasks', authenticateToken, async (req, res) => {
  const { taskboardId } = req.query;
  const userId = req.user.userId;

  if (!taskboardId) {
    return res.status(400).json({ error: 'Taskboard ID is required' });
  }

  try {
    // Verify if the taskboard belongs to the authenticated user directly via workspace or via user_taskboards
    const taskboardResult = await client.query(
      `SELECT tb.id 
       FROM taskboards tb
       LEFT JOIN workspaces w ON tb.workspace_id = w.id AND w.user_id = $2
       LEFT JOIN user_taskboards utb ON tb.id = utb.taskboard_id AND utb.user_id = $2
       WHERE tb.id = $1`,
      [taskboardId, userId]
    );
    
    if (taskboardResult.rowCount === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch tasks with assigned users' usernames
    const tasksQuery = `
      SELECT 
        t.m_id, 
        t.task_title, 
        t.task_content, 
        t.status, 
        t.importance,
        ARRAY_AGG(u.username) AS assigned_users
      FROM tasks t
      LEFT JOIN user_tasks ut ON t.m_id = ut.task_id
      LEFT JOIN users u ON ut.user_id = u.id
      WHERE t.taskboard_id = $1
      GROUP BY t.m_id
      ORDER BY t.m_id;
    `;
    const tasksResult = await client.query(tasksQuery, [taskboardId]);

    res.json(tasksResult.rows);
  } catch (err) {
    console.error('Error fetching tasks with usernames:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// API endpoint to update a task title and description
// API endpoint to update a task title and description
app.put('/api/update/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, status, importance, assignedTo } = req.body;

  console.log("Received update request for ID:", id);
  console.log("Update payload:", { title, content, status, importance, assignedTo });

  try {
    const result = await client.query(
      'UPDATE tasks SET task_title = $1, task_content = $2, status = $3, importance = $4 WHERE m_id = $5 RETURNING *',
      [title, content, status, importance, id]
    );

    if (result.rowCount === 0) {
      console.log("No note found for ID:", id);
      return res.status(404).json({ error: 'Note not found' });
    }

    const updatedTask = result.rows[0];
    console.log("Updated task:", updatedTask);

    // Convert assignedTo (usernames) to user IDs
    const userIds = await getUserIdsFromUsernames(assignedTo);

    // Update assigned users if necessary
    if (userIds && Array.isArray(userIds)) {
      console.log("Updating assigned users for task ID:", id);

      // First, clear existing assignments for this task
      await client.query('DELETE FROM user_tasks WHERE task_id = $1', [id]);
      console.log("Cleared existing user assignments for task ID:", id);

      // Then, add the new assignments
      const assignmentQueries = userIds.map(userId =>
        client.query(
          'INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2)',
          [userId, id]
        )
      );
      await Promise.all(assignmentQueries);
      console.log("Added new user assignments for task ID:", id);
    }

    // Logging the final response before sending it
    console.log("Final response being sent for task ID:", id, ":", updatedTask);

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).send('Server error');
  }
});



app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

//API endpoint to get user type
app.post('/api/getUserType', async (req, res) => {
  const { username } = req.body;
  try {
    const result = await client.query('SELECT user_type FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      res.json({ userType: result.rows[0].user_type });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

const fetchWorkspaces = async (userId, userType) => {
  try {
    const query = `
      SELECT 
        tb.id AS taskboard_id,
        tb.title AS name,
        tb.description AS description,
        tb.created_at AS start,
        tb.created_at AS end,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN t.status IN ('inProgress', 'codeReview', 'todo') THEN 1 ELSE 0 END) AS remaining,
        SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN t.status = 'inProgress' THEN 1 ELSE 0 END) AS revising
      FROM taskboards tb
      LEFT JOIN tasks t ON t.taskboard_id = tb.id
      JOIN workspaces w ON tb.workspace_id = w.id
      WHERE w.user_id = $1
      GROUP BY tb.id
    `;
    const res = await client.query(query, [userId]);
    console.log('Workspaces:', res.rows);
    return res.rows;
  } catch (err) {
    console.error('Error fetching workspaces:', err);
    return [];
  }
};

app.get('/api/workspaces', async (req, res) => {
  const userId = req.query.userId;
  const userType = req.query.userType;
  console.log('Fetching workspaces for user:', userId, 'with userType:', userType); // This should log the values
  const workspaces = await fetchWorkspaces(userId, userType);
  res.json(workspaces);
});
app.get('/api/user-tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const tasksQuery = `
      SELECT t.*, u.id as assignee_id, tb.title as taskboard
      FROM tasks t
      JOIN user_tasks ut ON ut.task_id = t.m_id
      JOIN users u ON u.id = ut.user_id
      JOIN taskboards tb ON tb.id = t.taskboard_id
      WHERE ut.user_id = $1;
    `;
    const result = await client.query(tasksQuery, [userId]);

    // Reshape the result if needed, e.g., grouping assignees together
    const tasks = result.rows.map(row => ({
      id: row.m_id,
      task_title: row.task_title,
      taskboard: row.taskboard,
      status: row.status === "todo" ? "To Do" : row.status === "inProgress" ? "In Progress" : row.status === "codeReview" ? "Code Review" : "Done",
      dueDate: row.due_date,  // Adjust field names based on your database
      dueTime: row.due_time,  // Adjust field names based on your database
      isLate: row.due_date < new Date(),  // Simple check for lateness
      flaggedForReview: row.flagged_for_review || false,
    }));

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching user's tasks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


