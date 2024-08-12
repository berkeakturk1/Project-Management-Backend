// models/task.js
module.exports = (sequelize, DataTypes) => {
    const Task = sequelize.define('Task', {
      m_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      task_title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      task_content: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'todo'
      },
      importance: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'No Time Constraint'
      },
      taskboard_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'taskboards', // Name of the taskboards table
          key: 'id'
        }
      }
    }, {
      tableName: 'tasks',
      timestamps: false // Disable automatic timestamps if not needed
    });
  
    return Task;
  };
  