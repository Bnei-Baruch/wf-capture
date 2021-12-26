import React, { Component, Fragment } from 'react';
import 'semantic-ui-css/semantic.min.css';
import Ingest from "./components/Ingest";


class App extends Component {

  render() {
    return (
        <Fragment>
            <Ingest capture={window.location.pathname.split('/')[1]} />
            {/*<Ingest capture="multi" />*/}
        </Fragment>
    );
  }
}

export default App;
