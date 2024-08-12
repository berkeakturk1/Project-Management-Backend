const express = require('express');
const router = express.Router(); // This defines the router
const { Task } = require('../models');

router.get('/taskboards/:taskboardId/tasks', async (req, res) => {
  const { taskboardId } = req.params;

  try {
    const tasks = await Task.findAll({
      where: { taskboard_id: taskboardId }
    });

    if (!tasks) {
      return res.status(404).json({ message: 'Tasks not found' });
    }

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; // This exports the router for use in server/index.js
