 // nosemgrep: jsx-not-internationalized
import { Layout } from 'antd';

const { Footer } = Layout;

const AppFooter = ({user}) => {


  return (
    <Footer style={{ textAlign: 'center' }}>
      {/* nosemgrep: jsx-not-internationalized */}
      Employee Productivity GenAI Assistant Example© 2024
      {/* nosemgrep: jsx-not-internationalized */}

    </Footer>
  );
};
export default AppFooter;

