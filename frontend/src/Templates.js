 // nosemgrep: jsx-not-internationalized
import React, { useState, useEffect } from 'react';
import { Form, Input, Button, List, Modal, Radio, Select, message, Typography, Spin, Tooltip  } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, InfoCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { fetchTokenIfExpired } from './utils/authHelpers'


const { TextArea } = Input;
const { Option } = Select;
const apiUrl = process.env.REACT_APP_API_URL;

const Templates = ({user}) => {
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({});
  const [modalMode, setModalMode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const email = user?.email;
  const [form] = Form.useForm();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCloning, setIsCloning] = useState(false);



  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const groups = user?.signInUserSession?.accessToken?.payload?.['cognito:groups'];
        if (groups && groups.includes('Admin')) {
          setIsAdmin(true);
        }
      } catch (error) {
        console.error('Error getting user info:', error);
      }
    };
    
    fetchTemplates();
    checkAdminRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modelOptions = [
    { label: 'anthropic.claude-3-haiku-20240307-v1:0', value: 'anthropic.claude-3-haiku-20240307-v1:0' },
    { label: 'anthropic.claude-3-sonnet-20240229-v1:0', value: 'anthropic.claude-3-sonnet-20240229-v1:0' },
    { label: 'anthropic.claude-3-5-sonnet-20240620-v1:0', value: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
    { label: 'anthropic.claude-3-opus-20240229-v1:0', value: 'anthropic.claude-3-opus-20240229-v1:0' },
    { label: 'anthropic.claude-v2:1', value: 'anthropic.claude-v2:1' },
    { label: 'anthropic.claude-v2', value: 'anthropic.claude-v2' },
    { label: 'anthropic.claude-instant-v1', value: 'anthropic.claude-instant-v1' }
    // Add more model options here...
  ];

  




  const fetchTemplates = async () => {
    setIsLoading(true); // Start loading
    try {
      const authorizationToken = await fetchTokenIfExpired();  
      // Fetch public templates
      const publicResponse = await fetch(`${apiUrl}/templates?visibility=public`, {
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken
        }
      });
      const publicTemplates = await publicResponse.json();
  
      // Fetch user-specific templates
      const userResponse = await fetch(`${apiUrl}/templates?createdBy=${email}`, {
        headers: { authorizationToken }
      });
      const userTemplates = await userResponse.json();
  
      // Combine and remove duplicates
      const combinedTemplates = [...publicTemplates, ...userTemplates.filter(t => !publicTemplates.some(pt => pt.templateId === t.templateId))];
      setPromptTemplates(combinedTemplates);
  
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false); // Stop loading regardless of success or failure
    }
  };

  const handleAddTemplate = () => {
    openModal('add');
  };

  const handleEditTemplate = (template) => {
    openModal('edit', template);
  };
  
  const handleUpdateTemplate = async (template) => {
    try {
      const authorizationToken = await fetchTokenIfExpired();
      
      const response = await fetch(`${apiUrl}/templates`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken
        },
        body: JSON.stringify(template)
      });
  
      if (response.ok) {
        message.success('Template updated successfully');
        fetchTemplates();  // Refresh the list
      } else {
        message.error('Error updating template');
      }
    } catch (error) {
      console.error('Error updating template:', error);
      message.error('Error updating template');
    }

    setIsModalVisible(false);
    form.resetFields();

  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      const authorizationToken = await fetchTokenIfExpired();
      
      const response = await fetch(`${apiUrl}/templates`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken
        },
        body: JSON.stringify({ 
          'templateId': templateId,
          'createdBy': email
         })
      });
  
      if (response.ok) {
        message.success('Template deleted successfully');
        fetchTemplates();  // Refresh the list
      } else {
        message.error('Error deleting template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      message.error('Error deleting template');
    }
  };
  

  const handleFormFinish = async (values) => {
    try {
      const authorizationToken = await fetchTokenIfExpired();
      const payload = {
        ...values,
        createdBy: email,
      };

      if (!isAdmin) {
        payload.visibility = 'private'; // Force the visibility to private for non-admins
      }
      
      const response = await fetch(`${apiUrl}/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken
        },
        body: JSON.stringify(payload)
      });
  
      if (response.ok) {
        message.success('Template added successfully');
        fetchTemplates();  // Refresh the list
      } else {
        message.error('Error adding template');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      message.error('Error creating template');
    }
  
    setIsModalVisible(false);
    form.resetFields();
  };
  
  const handleCloneTemplate = (template) => {
    // Clone the template with modifications
    const clonedTemplate = {
      ...template,
      templateId: null, // Reset the template ID as this will be a new entry
      templateName: `${template.templateName} Copy`, // Append 'Copy' to the name
      visibility: 'private', // Set to 'private' for non-admins
    };
  
    // Open the modal in 'add' mode with the cloned template
    setCurrentTemplate(clonedTemplate);
    setModalMode('add');
    form.setFieldsValue(clonedTemplate);
    setIsCloning(true);
    setIsModalVisible(true);
  };

  const handleViewTemplate = (template) => {
    openModal('view', template);
  };

  const openModal = (mode, template = {}) => {
    setModalMode(mode); // Set to 'add', 'edit', or 'view'
    setCurrentTemplate(template); // Set the current template, if any
    setIsModalVisible(true); // Open the modal
    setIsCloning(false);
  
    // Pre-set form values based on the mode and user role
    let formValues = {};
    if (mode === 'add') {
      formValues = {
        createdBy: email,
        visibility: isAdmin ? 'public' : 'private' // Admins default to 'public', non-admins to 'private'
      };
    } else {
      formValues = template;
    }
  
    // If the user is not an admin and we're not viewing, force the visibility to 'private'
    if (!isAdmin && mode !== 'view') {
      formValues.visibility = 'private';
    }
  
    // Set form values to state
    form.setFieldsValue(formValues);
  };

  const closeModal = () => {
    setModalMode(null); // Reset modal mode
    setIsModalVisible(false); // Close the modal
    setIsCloning(false);
    form.resetFields(); // Reset form fields
  };
  
  const filteredTemplates = promptTemplates
  .filter(template => {
    const name = template.templateName || ''; // Fallback to empty string if name is undefined
    const searchMatch = name.toLowerCase().includes(searchTerm.toLowerCase());

    if (visibilityFilter === 'all') {
      return searchMatch;
    }

    const isPublic = template.visibility === 'public';
    const visibilityMatch = visibilityFilter === 'public' ? isPublic : !isPublic;
    return searchMatch && visibilityMatch;
  })
  .sort((a, b) => {
    // Sort public templates to the top
    if (a.visibility === 'public' && b.visibility !== 'public') {
      return -1;
    }
    if (a.visibility !== 'public' && b.visibility === 'public') {
      return 1;
    }
    return 0; // Maintain original order if both have the same visibility
  });

  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12
      ? '🌅 Good morning,'
      : hours < 18
      ? '🌞 Good afternoon,'
      : '🌙 Good evening,';
  };

  return (
    <div> 
      <div>
        { /* nosemgrep: jsx-not-internationalized */}
        <h1 style={{ marginTop: '-20px' }}>Templates</h1>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4A90E2' }}>
          {getGreeting()} {email}!
      </div>
    <br />

    {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '20vh' }}>
          <Spin tip="Loading Templates..." size="large">
          </Spin>
        </div>
      ) : (
        <>
      { /* nosemgrep: jsx-not-internationalized */}
      <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTemplate}>
        Add New Prompt Template
      </Button>
      <br />
      <br />

      <Input
        placeholder="Search Prompt Templates"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{ marginBottom: '20px' }}
      />
      <Radio.Group
        options={[
          { label: 'All', value: 'all' },
          { label: 'Public', value: 'public' },
          { label: 'Private', value: 'private' },
        ]}
        onChange={e => setVisibilityFilter(e.target.value)}
        value={visibilityFilter}
        optionType="button"
        style={{ marginBottom: '20px' }}
      />
      <List
        itemLayout="horizontal"
        dataSource={filteredTemplates}
        renderItem={item => {
          const isOwner = item.createdBy === email;
          const actions = isOwner ? [
            <EditOutlined key="edit" onClick={() => handleEditTemplate(item)} />,
            <DeleteOutlined key="delete" onClick={() => handleDeleteTemplate(item.templateId)} />,
            <CopyOutlined key="clone" onClick={() => handleCloneTemplate(item)} />
          ] : [
            <EyeOutlined key="view" onClick={() => handleViewTemplate(item)} />,
            <CopyOutlined key="clone" onClick={() => handleCloneTemplate(item)} />
          ];

          return (
            <List.Item actions={actions}>
              <List.Item.Meta
                title={
                  <div style={{ wordBreak: 'break-word' }}>
                    {item.templateName}
                    <span style={{ fontWeight: 'bold', marginLeft: '10px', color: item.visibility === 'public' ? 'green' : 'red' }}>
                      {item.visibility.toUpperCase()}
                    </span>
                  </div>
                }
                description={
                  <div style={{ wordBreak: 'break-word' }}>
                    {item.templateDescription}
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />
      <Modal
        title={
          isCloning ? 'Clone Prompt Template' :
          modalMode === 'edit' ? 'Edit Prompt Template' :
          modalMode === 'view' ? 'View Prompt Template' : 'Add Prompt Template'
        }
        visible={isModalVisible}
        onCancel={closeModal}
        footer={
          modalMode === 'edit' || modalMode === 'add' || isCloning ? [
            // nosemgrep: jsx-not-internationalized
            <Button key="submit" type="primary" onClick={() => form.submit()}>
              Save
            </Button>,
            // nosemgrep: jsx-not-internationalized 
            <Button key="back" onClick={closeModal}>
              Cancel
            </Button>
          ] : [
            // nosemgrep: jsx-not-internationalized
            <Button key="back" onClick={closeModal}>
              Close
            </Button>
          ]
        }
      >
        <Form layout="vertical" form={form} onFinish={modalMode === 'add' ? handleFormFinish : handleUpdateTemplate}>
          <Form.Item
            name="templateId"
            label="Template Id"
            hidden={true}
          />
          <Form.Item
            name="createdBy"
            label="Created By"
            hidden={true} 
          />
          <Form.Item
            name="templateName"
            label="Name"
            rules={[{ required: true, message: 'Please input the template name!' }]}
          >
            <Input readOnly={modalMode === 'view'} />
          </Form.Item>
          <Form.Item
            name="templateDescription"
            label="Description"
            rules={[{ required: true, message: 'Please input the template description!' }]}
          >
            <Input readOnly={modalMode === 'view'} />
          </Form.Item>
          <Form.Item
            name="modelversion"
            label="Model Selection"
            rules={[{ required: true, message: 'Please select a model!' }]}
          >
            <Select
              showSearch
              placeholder="Select a model"
              optionFilterProp="children"
              disabled={modalMode === 'view'}
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {modelOptions.map(option => (
                <Option key={option.value} value={option.value}>{option.label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="systemPrompt"
            label="System Prompt"
            rules={[{ required: false }]} // Set to true if required
          >
            <TextArea readOnly={modalMode === 'view'} rows={4} />
          </Form.Item>
          <Form.Item
            name="templatePrompt"
            label={
              // nosemgrep: jsx-not-internationalized
              <span>
                User data&nbsp;
                <Tooltip title="Add ${INPUT_DATA} as variable"> {/* eslint-disable-line no-template-curly-in-string */}
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            rules={[{ required: true, message: 'Please input the template prompt!' }]}
          >
            <TextArea readOnly={modalMode === 'view'} rows={4} />
          </Form.Item>
          <Form.Item
            name="templateGuidance"
            label="Template Prompt Guidance"
            rules={[{ required: true, message: 'Please input the template prompt guidance!' }]}
          >
            <TextArea readOnly={modalMode === 'view'} rows={1} />
          </Form.Item>
          <Form.Item
            name="visibility"
            label="Visibility"
            rules={[{ required: true, message: 'Please select the visibility!' }]}
          >
          <Select disabled={modalMode === 'view' || !isAdmin}>
            { /* nosemgrep: jsx-not-internationalized */}
            <Option value="public">Public</Option>
            { /* nosemgrep: jsx-not-internationalized */}
            <Option value="private">Private</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          { /* nosemgrep: jsx-not-internationalized */}
          <Typography.Text>Created by: {modalMode === 'add' ? email : currentTemplate.createdBy}</Typography.Text>
        </Form.Item>
        </Form>
      </Modal>
      </>
      )}
    </div>
  );
};

export default Templates;
