 // nosemgrep: jsx-not-internationalized

import React from 'react';
import { View, Heading } from '@aws-amplify/ui-react';

const CustomAuthHeader = () => {
  return (
    <View padding="0.5rem" textAlign="center" p>
      {/* nosemgrep: jsx-not-internationalized */}
      <br></br>
      {/* nosemgrep: jsx-not-internationalized */}
      <Heading level={5}>  Employee Productivity GenAI Assistant Example </Heading> 
    </View>
  );
};

export default CustomAuthHeader;
